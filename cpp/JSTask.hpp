//
//  JSTask2.hpp
//  SyncTasks
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#ifndef JSTask_hpp
#define JSTask_hpp

#include "jsi/jsi.h"
#include <ReactCommon/CallInvoker.h>


facebook::jsi::Function createJSTaskCreator(facebook::jsi::Runtime& rt,
                                            std::shared_ptr<facebook::react::CallInvoker> callInvoker);

#endif /* JSTask_hpp */
