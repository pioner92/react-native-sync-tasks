//
//  TaskScheduler.cpp
//  intch_application
//
//  Created by Oleksandr Shumihin on 10/4/25.
//  Copyright © 2025 Facebook. All rights reserved.
//

#pragma once

#include "atomic"
#include "jsi/jsi.h"
#include "queue"
#include "thread"
#include "constants.hpp"

using namespace std;
using namespace facebook;

class Task : public jsi::NativeState {
 public:
  Task(std::string id, int intervalMs, std::function<void(Task&)> job)
      : id_(std::move(id)),job_(std::move(job)), intervalMs_(intervalMs) {}

  ~Task() = default;

  void run() {
    if (job_ && ready_ && !stopped_)
      job_(*this);
  }

  const std::string& getId() const { return id_; }
  int getInterval() const { return intervalMs_; }

  void stop() { stopped_ = true; }

  void start() {
    if (ready_) {
      stopped_ = false;
    }
  }

  bool isStopped() const { return stopped_; }
  bool isReady() const { return ready_; }

  void makeReady() { ready_ = true; }

  void setLastBodyHash(size_t value){
    lastBodyHash_ = value;
  }

  bool hasSameBodyHash(size_t value) const {
    return lastBodyHash_ == value;
  }

 private:
  std::string id_;
  std::function<void(Task& t)> job_;
  std::atomic<bool> stopped_ = true;
  size_t lastBodyHash_;
  int intervalMs_;
  bool ready_ = false;
};

// ========== ThreadPool ==========
class ThreadPool {
 public:
  ThreadPool(size_t numThreads) {
    stop_ = false;
    for (size_t i = 0; i < numThreads; ++i) {
      workers_.emplace_back([this]() {
        while (true) {
          std::function<void()> task;

          {
            std::unique_lock lock(queueMutex_);
            cv_.wait(lock, [this]() { return stop_ || !tasks_.empty(); });

            if (stop_ && tasks_.empty())
              return;

            task = std::move(tasks_.front());
            tasks_.pop();
          }

          task();
        }
      });
    }
  }

  ~ThreadPool() {
    {
      std::unique_lock lock(queueMutex_);
      stop_ = true;
    }
    cv_.notify_all();
    for (auto& worker : workers_) {
      if (worker.joinable())
        worker.join();
    }
  }

  void enqueue(std::function<void()> job) {
    {
      std::unique_lock lock(queueMutex_);
      tasks_.push(std::move(job));
    }
    cv_.notify_one();
  }

 private:
  std::vector<std::thread> workers_;
  std::queue<std::function<void()>> tasks_;
  std::mutex queueMutex_;
  std::condition_variable cv_;
  bool stop_;
};

// ========== TaskEntry (for priority_queue) ==========
struct TaskEntry {
  std::chrono::steady_clock::time_point nextRun;
  std::shared_ptr<Task> task;

  TaskEntry(std::chrono::steady_clock::time_point next,std::shared_ptr<Task> t):nextRun(std::move(next)), task(std::move(t)) {
    task->makeReady();
  }

  bool operator<(const TaskEntry& other) const {
    return nextRun > other.nextRun;  // min-heap
  }
};

// ========== TaskScheduler ==========
class TaskScheduler : public jsi::NativeState {
 public:
  TaskScheduler(int numThreads = 4) : pool_(numThreads), running_(false) {}
  ~TaskScheduler() { stop(); };

  void addTask(std::shared_ptr<Task> task) {
    std::unique_lock lock(mutex_);

    if(taskMap_.contains(task->getId())){
      return;
    }

    tasks_.emplace(std::chrono::steady_clock::now() +
      std::chrono::milliseconds(task->getInterval()),
      task);

    taskMap_[task->getId()] = task;
    cv_.notify_all();
  }

  void start() {
    if (!running_) {
      running_ = true;
      schedulerThread_ = std::thread(&TaskScheduler::schedulerLoop, this);
    }

    for (auto& [id, task] : taskMap_) {
      task->start();
    }
  }

  void stop() {
    {
      std::unique_lock lock(mutex_);
      running_ = false;
    }

    for (auto& [id, task] : taskMap_) {
      task->stop();
    }

    cv_.notify_all();
    if (schedulerThread_.joinable())
      schedulerThread_.join();
  }

  bool hasTaskWithId(const std::string& id){
    return taskMap_.contains(id);
  }

 private:
  std::priority_queue<TaskEntry> tasks_;
  std::unordered_map<std::string, std::shared_ptr<Task>> taskMap_;
  std::mutex mutex_;
  std::condition_variable cv_;
  ThreadPool pool_;
  std::thread schedulerThread_;
  bool running_;

  void schedulerLoop() {
    while (running_) {
      std::unique_lock lock(mutex_);

      if (tasks_.empty()) {
        cv_.wait(lock);
        continue;
      }

      auto now = std::chrono::steady_clock::now();
      TaskEntry entry = tasks_.top();

      if (entry.nextRun <= now) {
        tasks_.pop();

        auto taskToRun = entry.task;
        pool_.enqueue([taskToRun]() { taskToRun->run(); });

        // Reschedule
        entry.nextRun =
            now + std::chrono::milliseconds(taskToRun->getInterval());
        tasks_.emplace(entry);
      } else {
        cv_.wait_until(lock, entry.nextRun);
      }
    }
  }
};
