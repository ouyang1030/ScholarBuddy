import AppKit
import UserNotifications
import EventKit

// A bundled accessory app gives notifications a stable identity and opens the
// relevant ScholarBuddy record when a notification is clicked.
final class ReminderDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    let center = UNUserNotificationCenter.current()
    let store = EKEventStore()
    var output: URL?
    func finish(_ result: [String: Any]) {
        if let output = output, let data = try? JSONSerialization.data(withJSONObject: result) {
            try? data.write(to: output, options: .atomic)
        }
        DispatchQueue.main.async { NSApplication.shared.terminate(nil) }
    }
    func applicationWillFinishLaunching(_ notification: Notification) { center.delegate = self }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        guard let index = args.firstIndex(of: "--request"), args.count > index + 2 else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { NSApplication.shared.terminate(nil) }
            return
        }
        output = URL(fileURLWithPath: args[index + 2])
        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: args[index + 1]))
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            run(payload)
        } catch { finish(["error": "Could not read notification request."]) }
    }
    func status() {
        center.getNotificationSettings { settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional: permission = "granted"
            case .denied: permission = "denied"
            default: permission = "notDetermined"
            }
            self.finish(["permission": permission, "calendarPermission": self.calendarAllowed() ? "granted" : "denied"])
        }
    }
    func calendarAllowed() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(macOS 14.0, *) { return status == .fullAccess }
        return status == .authorized
    }
    func run(_ payload: [String: Any]) {
        switch payload["action"] as? String ?? "status" {
        case "authorize":
            center.requestAuthorization(options: [.alert, .sound]) { _, error in
                if let error = error { self.finish(["error": error.localizedDescription]); return }
                if payload["calendar"] as? Bool == true && !self.calendarAllowed() {
                    let completion: (Bool, Error?) -> Void = { _, _ in self.status() }
                    if #available(macOS 14.0, *) { self.store.requestFullAccessToEvents(completion: completion) }
                    else { self.store.requestAccess(to: .event, completion: completion) }
                } else { self.status() }
            }
        case "calendar":
            guard calendarAllowed() else { finish(["error": "Allow Calendar access for ScholarBuddy Reminders in System Settings."]); return }
            let start = Date(timeIntervalSince1970: (payload["start"] as? Double ?? 0) / 1000)
            let end = Date(timeIntervalSince1970: (payload["end"] as? Double ?? 0) / 1000)
            let formatter = ISO8601DateFormatter()
            // EventKit expands recurring occurrences, including exceptions.
            let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil)).map { event -> [String: Any] in
                return ["id": event.calendarItemExternalIdentifier ?? event.eventIdentifier ?? "", "calendarId": event.calendar.calendarIdentifier,
                        "calendar": event.calendar.title, "title": event.title ?? "Untitled event", "start": formatter.string(from: event.startDate),
                        "end": formatter.string(from: event.endDate), "allDay": event.isAllDay]
            }
            finish(["events": events])
        case "clear":
            center.removeAllPendingNotificationRequests()
            finish(["ok": true])
        case "send":
            center.getNotificationSettings { settings in
                guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                    self.finish(["error": "Allow notifications for ScholarBuddy Reminders in System Settings."]); return
                }
                let id = payload["id"] as? String ?? UUID().uuidString
                self.center.getDeliveredNotifications { delivered in
                    if delivered.contains(where: { $0.request.identifier == id }) { self.finish(["ok": true]); return }
                    let content = UNMutableNotificationContent()
                    content.title = payload["title"] as? String ?? "ScholarBuddy"
                    content.body = payload["body"] as? String ?? ""
                    content.sound = .default
                    content.userInfo = ["url": payload["url"] as? String ?? ""]
                    self.center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) { error in
                        if let error = error { self.finish(["error": error.localizedDescription]) }
                        else { self.finish(["ok": true]) }
                    }
                }
            }
        default: status()
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let value = response.notification.request.content.userInfo["url"] as? String,
           let url = URL(string: value), ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        completionHandler()
        NSApplication.shared.terminate(nil)
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
let app = NSApplication.shared
let delegate = ReminderDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
