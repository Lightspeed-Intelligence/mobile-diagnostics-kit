#include <jni.h>

#include <MMKV/MMKV.h>

#include <cmath>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace {

struct StoredValue {
  std::string kind;
  std::string value;
};

std::string fromJavaString(JNIEnv *environment, jstring value) {
  if (value == nullptr) {
    return "";
  }
  const char *characters = environment->GetStringUTFChars(value, nullptr);
  std::string result(characters == nullptr ? "" : characters);
  if (characters != nullptr) {
    environment->ReleaseStringUTFChars(value, characters);
  }
  return result;
}

MMKV *defaultStorage(const std::string &root) {
  MMKV::initializeMMKV(root, MMKVLogWarning);
  return MMKV::mmkvWithID(DEFAULT_MMAP_ID, mmkv::DEFAULT_MMAP_SIZE,
                          MMKV_SINGLE_PROCESS, nullptr, &root);
}

StoredValue readValue(MMKV *storage, const std::string &key) {
  std::string stringValue;
  if (storage->getString(key, stringValue)) {
    return {"string", stringValue};
  }

  bool hasNumber = false;
  double numberValue = storage->getDouble(key, 0.0, &hasNumber);
  if (hasNumber) {
    std::ostringstream stream;
    stream << std::setprecision(15) << numberValue;
    return {"number", stream.str()};
  }

  bool hasBoolean = false;
  bool booleanValue = storage->getBool(key, false, &hasBoolean);
  if (hasBoolean) {
    return {"boolean", booleanValue ? "true" : "false"};
  }

  return {"binary", "<binary or unreadable>"};
}

}  // namespace

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_mobilediagnosticskit_MobileDiagnosticsStorage_readDefaultNative(
    JNIEnv *environment, jclass, jstring root_path) {
  std::string root = fromJavaString(environment, root_path);
  MMKV *storage = defaultStorage(root);
  std::vector<std::string> flattened;
  if (storage != nullptr) {
    for (const auto &key : storage->allKeys()) {
      StoredValue stored = readValue(storage, key);
      flattened.push_back(key);
      flattened.push_back(stored.kind);
      flattened.push_back(stored.value);
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

extern "C" JNIEXPORT jboolean JNICALL
Java_com_mobilediagnosticskit_MobileDiagnosticsStorage_writeDefaultNative(
    JNIEnv *environment, jclass, jstring root_path, jstring storage_key,
    jstring storage_kind, jstring storage_value) {
  std::string root = fromJavaString(environment, root_path);
  std::string key = fromJavaString(environment, storage_key);
  std::string kind = fromJavaString(environment, storage_kind);
  std::string value = fromJavaString(environment, storage_value);
  MMKV *storage = defaultStorage(root);
  if (storage == nullptr || key.empty()) {
    return JNI_FALSE;
  }
  if (kind == "string") {
    return storage->set(value, key) ? JNI_TRUE : JNI_FALSE;
  }
  if (kind == "number") {
    try {
      size_t parsed = 0;
      double number_value = std::stod(value, &parsed);
      if (parsed != value.size() || !std::isfinite(number_value)) {
        return JNI_FALSE;
      }
      return storage->set(number_value, key) ? JNI_TRUE : JNI_FALSE;
    } catch (...) {
      return JNI_FALSE;
    }
  }
  if (kind == "boolean") {
    if (value != "true" && value != "false") {
      return JNI_FALSE;
    }
    bool boolean_value = value == "true";
    return storage->set(boolean_value, key) ? JNI_TRUE : JNI_FALSE;
  }
  return JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_mobilediagnosticskit_MobileDiagnosticsStorage_removeDefaultNative(
    JNIEnv *environment, jclass, jstring root_path, jstring storage_key) {
  std::string root = fromJavaString(environment, root_path);
  std::string key = fromJavaString(environment, storage_key);
  MMKV *storage = defaultStorage(root);
  if (storage == nullptr || key.empty() || !storage->containsKey(key)) {
    return JNI_FALSE;
  }
  return storage->removeValueForKey(key) ? JNI_TRUE : JNI_FALSE;
}
