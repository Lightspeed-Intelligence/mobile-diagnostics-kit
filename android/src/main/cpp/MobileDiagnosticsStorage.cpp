#include <jni.h>

#include <MMKV/MMKV.h>

#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace {

std::string readValue(MMKV *storage, const std::string &key) {
  std::string stringValue;
  if (storage->getString(key, stringValue)) {
    return stringValue;
  }

  bool hasNumber = false;
  double numberValue = storage->getDouble(key, 0.0, &hasNumber);
  if (hasNumber) {
    std::ostringstream stream;
    stream << std::setprecision(15) << numberValue;
    return stream.str();
  }

  bool hasBoolean = false;
  bool booleanValue = storage->getBool(key, false, &hasBoolean);
  if (hasBoolean) {
    return booleanValue ? "true" : "false";
  }

  return "<binary or unreadable>";
}

}  // namespace

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_mobilediagnosticskit_MobileDiagnosticsStorage_readDefaultNative(
    JNIEnv *environment, jclass, jstring root_path) {
  const char *root_chars = environment->GetStringUTFChars(root_path, nullptr);
  std::string root(root_chars == nullptr ? "" : root_chars);
  if (root_chars != nullptr) {
    environment->ReleaseStringUTFChars(root_path, root_chars);
  }

  MMKV::initializeMMKV(root, MMKVLogWarning);
  MMKV *storage = MMKV::mmkvWithID(
      DEFAULT_MMAP_ID, mmkv::DEFAULT_MMAP_SIZE, MMKV_SINGLE_PROCESS, nullptr,
      &root);
  std::vector<std::string> flattened;
  if (storage != nullptr) {
    for (const auto &key : storage->allKeys()) {
      flattened.push_back(key);
      flattened.push_back(readValue(storage, key));
    }
  }

  jclass string_class = environment->FindClass("java/lang/String");
  jobjectArray result = environment->NewObjectArray(
      static_cast<jsize>(flattened.size()), string_class, nullptr);
  for (size_t index = 0; index < flattened.size(); ++index) {
    jstring value = environment->NewStringUTF(flattened[index].c_str());
    environment->SetObjectArrayElement(result, static_cast<jsize>(index), value);
    environment->DeleteLocalRef(value);
  }
  return result;
}
