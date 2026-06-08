from playwright.sync_api import sync_playwright


URL = "http://localhost:5173"
LOG_PATH = "/tmp/browser_console.log"

console_logs = []


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})

    def handle_console_message(message):
        line = f"[{message.type}] {message.text}"
        console_logs.append(line)
        print(f"Console: {line}")

    page.on("console", handle_console_message)

    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/console_logging_page.png", full_page=True)

    browser.close()


with open(LOG_PATH, "w", encoding="utf-8") as log_file:
    log_file.write("\n".join(console_logs))

print(f"\nCaptured {len(console_logs)} console messages")
print(f"Logs saved to: {LOG_PATH}")
