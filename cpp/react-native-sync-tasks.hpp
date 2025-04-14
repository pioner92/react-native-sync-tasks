#ifndef SYNCTASKS_H
#define SYNCTASKS_H

#import "jsi/jsi.h"
#include <ReactCommon/CallInvoker.h>



namespace sh::synctasks {

  using namespace std;
  using namespace facebook;

  void install(jsi::Runtime* rt,
               std::shared_ptr<react::CallInvoker> callInvoker);

}

#endif /* SYNCTASKS_H */
