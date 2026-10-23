export function notify(title, body) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    const n = new Notification(title, {
      body,
      icon: "/icons/icon-192.png"
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }
}
