//
//  constants.hpp
//  Pods
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#pragma once

constexpr const char* LIB_NAME = "SyncTasksManager";

constexpr const char* CONFIG_KEY = "config";
constexpr const char* URL_KEY = "url";
constexpr const char* INTERVAL_KEY = "interval";
constexpr const char* HEADERS_KEY = "headers";
constexpr const char* TIMEOUT_KEY = "timeout";
constexpr const char* METHOD_KEY = "method";
constexpr const char* BODY_KEY = "body";
constexpr const char* JITTER_KEY = "jitter";
constexpr const char* BACKOFF_KEY = "backoff";
constexpr const char* MULTIPLIER_KEY = "multiplier";
constexpr const char* MAX_INTERVAL_KEY = "maxInterval";
constexpr const char* IMMEDIATE_KEY = "immediate";
constexpr const char* CONDITIONAL_KEY = "conditional";

constexpr const char* ON_DATA_KEY = "onData";
constexpr const char* ON_ERROR_KEY = "onError";
constexpr const char* SYNC_TASK_MANAGER_KEY = "SyncTasksManager";
constexpr const char* CREATE_TASK_KEY = "createTask";

constexpr const char* ADD_TASK_KEY = "addTask";
constexpr const char* ADD_TASKS_KEY = "addTasks";
constexpr const char* REMOVE_TASK_KEY = "removeTask";
constexpr const char* START_ALL_KEY = "startAll";
constexpr const char* STOP_ALL_KEY = "stopAll";
constexpr const char* SET_MAX_CONCURRENT_KEY = "setMaxConcurrentRequests";

constexpr int DEFAULT_TIMEOUT_MS = 30000;
constexpr double DEFAULT_BACKOFF_MULTIPLIER = 2;
constexpr int DEFAULT_MAX_BACKOFF_MS = 60000;

constexpr int DEFAULT_MAX_CONCURRENT_REQUESTS = 4;
constexpr int MAX_CONCURRENT_REQUESTS = 64;
