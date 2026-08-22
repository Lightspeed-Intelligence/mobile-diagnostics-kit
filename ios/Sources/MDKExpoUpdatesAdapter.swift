import EXUpdates
import Foundation

@objc(MDKExpoUpdatesAdapter)
final class MDKExpoUpdatesAdapter: NSObject {
    @objc static func runtimeInfo() -> [String: Any] {
        guard AppController.isInitialized() else {
            return ["isEnabled": false]
        }

        var result = AppController.sharedInstance
            .getConstantsForModule()
            .toModuleConstantsMap()
            .compactMapValues { $0 }
        if let manifest = result["manifest"] as? [String: Any],
           let branch = sourceBranch(in: manifest) {
            result["sourceBranch"] = branch
        }
        return result
    }

    @objc static func checkAndApply(
        completion: @escaping (String) -> Void
    ) {
        guard AppController.isInitialized() else {
            complete("unavailable", completion)
            return
        }

        let controller = AppController.sharedInstance
        controller.checkForUpdate { result in
            switch result {
            case .noUpdateAvailable:
                complete("up-to-date", completion)
            case .updateAvailable, .rollBackToEmbedded:
                fetchAndRelaunch(controller: controller, completion: completion)
            case let .error(error):
                complete("failed:\(error.localizedDescription)", completion)
            }
        } error: { error in
            complete("failed:\(error.localizedDescription)", completion)
        }
    }

    private static func fetchAndRelaunch(
        controller: InternalAppControllerInterface,
        completion: @escaping (String) -> Void
    ) {
        controller.fetchUpdate { result in
            switch result {
            case .success, .rollBackToEmbedded:
                controller.requestRelaunch {
                    complete("relaunching", completion)
                } error: { error in
                    complete("failed:\(error.localizedDescription)", completion)
                }
            case .failure:
                complete("failed:Update download failed", completion)
            case let .error(error):
                complete("failed:\(error.localizedDescription)", completion)
            }
        } error: { error in
            complete("failed:\(error.localizedDescription)", completion)
        }
    }

    private static func sourceBranch(in manifest: [String: Any]) -> String? {
        if let extra = manifest["extra"] as? [String: Any] {
            if let value = extra["sourceBranch"] as? String, !value.isEmpty {
                return value
            }
            if let expoClient = extra["expoClient"] as? [String: Any],
               let clientExtra = expoClient["extra"] as? [String: Any],
               let value = clientExtra["sourceBranch"] as? String,
               !value.isEmpty {
                return value
            }
        }
        if let value = manifest["branchName"] as? String, !value.isEmpty {
            return value
        }
        if let metadata = manifest["metadata"] as? [String: Any],
           let value = metadata["branchName"] as? String,
           !value.isEmpty {
            return value
        }
        if let extra = manifest["extra"] as? [String: Any] {
            if let eas = extra["eas"] as? [String: Any],
               let value = eas["branchName"] as? String,
               !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private static func complete(
        _ result: String,
        _ completion: @escaping (String) -> Void
    ) {
        DispatchQueue.main.async {
            completion(result)
        }
    }
}
