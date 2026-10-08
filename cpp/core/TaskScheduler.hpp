//
//  TaskScheduler.hpp
//  SyncTasks
//
//  Created by Oleksandr Shumihin on 10/4/25.
//

#pragma once

#include <algorithm>
#include <atomic>
#include <chrono>
#include <climits>
#include <cmath>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <queue>
#include <random>
#include <thread>
#include <unordered_map>
#include <vector>

#include "jsi/jsi.h"
#include "Fetcher.hpp"

using namespace facebook;

struct TaskOptions {
  int intervalMs = 1000;
  double jitter = 0;              // fraction of the interval, 0..1
  double backoffMultiplier = 1;   // 1 disables backoff
  int maxIntervalMs = INT_MAX;    // cap for the backoff delay
  bool immediate = false;         // first run right after addTask instead of after one interval
};

class Task : public jsi::NativeState, public std::enable_shared_from_this<Task> {
 public:
  // `generation` identifies the start()/stop() period the run belongs to.
  using Job = std::function<void(Task&, uint64_t generation)>;

  Task(TaskOptions options, Job job)
      : id_(nextId()), options_(options), job_(std::move(job)) {}

  uint64_t getId() const { return id_; }
  const TaskOptions& options() const { return options_; }

  void run() {
    if (!ready_ || stopped_ || removed_) {
      return;
    }

    // A task that was removed and added again can briefly have two scheduled runs.
    if (running_.exchange(true)) {
      return;
    }

    struct Release {
      std::atomic<bool>& flag;
      ~Release() { flag = false; }
    } release{running_};

    job_(*this, generation_);
  }

  void start() {
    if (ready_ && !removed_) {
      stopped_ = false;
    }
  }

  void stop() {
    stopped_ = true;
    ++generation_;
    cancelInFlight();
  }

  void remove() {
    removed_ = true;
    ++scheduleEpoch_;
    stop();
  }

  void makeReady() {
    removed_ = false;
    ready_ = true;
  }

  bool isStopped() const { return stopped_; }
  bool isRemoved() const { return removed_; }
  uint64_t scheduleEpoch() const { return scheduleEpoch_; }

  // Whether results of a run started in `generation` may still reach JS.
  bool isCurrent(uint64_t generation) const {
    return !stopped_ && !removed_ && generation_ == generation;
  }

  std::shared_ptr<CancelToken> beginRequest() {
    auto token = std::make_shared<CancelToken>();
    {
      std::lock_guard lock(inFlightMutex_);
      inFlight_ = token;
    }
    // stop() may have run between the generation check and here.
    if (stopped_ || removed_) {
      token->cancel();
    }
    return token;
  }

  void endRequest() {
    std::lock_guard lock(inFlightMutex_);
    inFlight_.reset();
  }

  void recordResult(bool ok) { failures_ = ok ? 0 : failures_ + 1; }

  int nextDelayMs() const {
    double delay = options_.intervalMs;

    if (failures_ > 0 && options_.backoffMultiplier > 1) {
      delay = std::min<double>(
          delay * std::pow(options_.backoffMultiplier, failures_), options_.maxIntervalMs);
    }

    if (options_.jitter > 0) {
      thread_local std::mt19937 rng{std::random_device{}()};
      std::uniform_real_distribution<double> spread(-options_.jitter, options_.jitter);
      delay *= 1 + spread(rng);
    }

    return static_cast<int>(std::clamp<double>(delay, 1, INT_MAX));
  }

  // Touched only by this task's own run, which never overlaps with itself.
  std::optional<size_t> lastBodyHash;
  std::string etag;
  std::string lastModified;

 private:
  static uint64_t nextId() {
    static std::atomic<uint64_t> counter{1};
    return counter++;
  }

  void cancelInFlight() {
    std::shared_ptr<CancelToken> token;
    {
      std::lock_guard lock(inFlightMutex_);
      token = inFlight_;
    }
    if (token) {
      token->cancel();
    }
  }

  const uint64_t id_;
  const TaskOptions options_;
  const Job job_;

  std::atomic<bool> ready_ = false;
  std::atomic<bool> stopped_ = true;
  std::atomic<bool> removed_ = false;
  std::atomic<bool> running_ = false;
  std::atomic<uint64_t> generation_ = 0;
  std::atomic<uint64_t> scheduleEpoch_ = 0;
  int failures_ = 0;

  std::mutex inFlightMutex_;
  std::shared_ptr<CancelToken> inFlight_;
};

// ========== ThreadPool ==========
// The number of threads is the number of requests that can run at the same time.
class ThreadPool {
 public:
  explicit ThreadPool(size_t size) { resize(size); }

  ~ThreadPool() {
    {
      std::lock_guard lock(mutex_);
      stop_ = true;
    }
    cv_.notify_all();
    for (auto& worker : workers_) {
      if (worker.joinable()) {
        worker.join();
      }
    }
  }

  void resize(size_t size) {
    std::lock_guard lock(mutex_);
    target_ = size;
    while (alive_ < target_) {
      workers_.emplace_back([this] { workerLoop(); });
      ++alive_;
    }
    cv_.notify_all();
  }

  void enqueue(std::function<void()> job) {
    {
      std::lock_guard lock(mutex_);
      jobs_.push(std::move(job));
    }
    cv_.notify_one();
  }

 private:
  void workerLoop() {
    while (true) {
      std::function<void()> job;
      {
        std::unique_lock lock(mutex_);
        cv_.wait(lock, [this] { return stop_ || alive_ > target_ || !jobs_.empty(); });

        // Surplus workers leave after a shrink; the rest drain the queue before shutdown.
        if (alive_ > target_ || (stop_ && jobs_.empty())) {
          --alive_;
          return;
        }

        job = std::move(jobs_.front());
        jobs_.pop();
      }
      job();
    }
  }

  std::vector<std::thread> workers_;
  std::queue<std::function<void()>> jobs_;
  std::mutex mutex_;
  std::condition_variable cv_;
  size_t target_ = 0;
  size_t alive_ = 0;
  bool stop_ = false;
};

// ========== TaskScheduler ==========
class TaskScheduler : public jsi::NativeState {
 public:
  explicit TaskScheduler(size_t poolSize) : pool_(poolSize) {}

  ~TaskScheduler() {
    // Abort in-flight requests so the pool joins without waiting for timeouts.
    std::vector<std::shared_ptr<Task>> tasks;
    {
      std::lock_guard lock(mutex_);
      for (auto& [id, task] : taskMap_) {
        tasks.push_back(task);
      }
    }
    for (auto& task : tasks) {
      task->remove();
    }
    stop();
  }

  void addTask(std::shared_ptr<Task> task) {
    std::lock_guard lock(mutex_);

    if (taskMap_.contains(task->getId())) {
      return;
    }

    task->makeReady();
    int delay = task->options().immediate ? 0 : task->options().intervalMs;
    queue_.push({Clock::now() + std::chrono::milliseconds(delay), task, task->scheduleEpoch()});
    taskMap_[task->getId()] = std::move(task);
    cv_.notify_all();
  }

  void removeTask(const std::shared_ptr<Task>& task) {
    std::lock_guard lock(mutex_);
    if (taskMap_.erase(task->getId())) {
      task->remove();
    }
  }

  void setPoolSize(size_t size) { pool_.resize(size); }

  void start() {
    {
      std::lock_guard lock(mutex_);
      for (auto& [id, task] : taskMap_) {
        task->start();
      }
    }

    if (!running_.exchange(true)) {
      if (schedulerThread_.joinable()) {
        schedulerThread_.join();
      }
      schedulerThread_ = std::thread([this] { schedulerLoop(); });
    }
  }

  void stop() {
    {
      std::lock_guard lock(mutex_);
      running_ = false;
      for (auto& [id, task] : taskMap_) {
        task->stop();
      }
    }
    cv_.notify_all();
    if (schedulerThread_.joinable()) {
      schedulerThread_.join();
    }
  }

 private:
  using Clock = std::chrono::steady_clock;

  struct Entry {
    Clock::time_point nextRun;
    std::shared_ptr<Task> task;
    uint64_t epoch;  // stale once the task is removed (and maybe added again)

    bool operator<(const Entry& other) const {
      return nextRun > other.nextRun;  // min-heap
    }
  };

  void schedulerLoop() {
    std::unique_lock lock(mutex_);

    while (running_) {
      if (queue_.empty()) {
        cv_.wait(lock);
        continue;
      }

      Entry entry = queue_.top();
      if (entry.nextRun > Clock::now()) {
        cv_.wait_until(lock, entry.nextRun);
        continue;
      }

      queue_.pop();
      if (entry.epoch != entry.task->scheduleEpoch()) {
        continue;
      }

      // The next run is scheduled when this one finishes, so a task never overlaps itself
      // and the backoff delay can depend on the result.
      pool_.enqueue([this, entry] {
        auto startedAt = Clock::now();
        entry.task->run();
        reschedule(entry, startedAt);
      });
    }
  }

  void reschedule(Entry entry, Clock::time_point startedAt) {
    auto nextRun = startedAt + std::chrono::milliseconds(entry.task->nextDelayMs());

    std::lock_guard lock(mutex_);
    if (entry.epoch != entry.task->scheduleEpoch()) {
      return;
    }
    entry.nextRun = std::max(nextRun, Clock::now());
    queue_.push(std::move(entry));
    cv_.notify_all();
  }

  // Declared before pool_ so they outlive the pool's workers during destruction.
  std::priority_queue<Entry> queue_;
  std::unordered_map<uint64_t, std::shared_ptr<Task>> taskMap_;
  std::mutex mutex_;
  std::condition_variable cv_;
  std::atomic<bool> running_ = false;
  ThreadPool pool_;
  std::thread schedulerThread_;
};
