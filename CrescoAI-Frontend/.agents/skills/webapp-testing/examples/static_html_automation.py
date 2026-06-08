import os

from playwright.sync_api import sync_playwright


HTML_FILE_PATH = os.path.abspath("path/to/your/file.html")
FILE_URL = f"file://{HTML_FILE_PATH}"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})

    page.goto(FILE_URL)
    page.screenshot(path="/tmp/static_page.png", full_page=True)

    if page.locator("text=Click Me").count():
        page.click("text=Click Me")

    if page.locator("#name").count():
        page.fill("#name", "Jane Doe")

    if page.locator("#email").count():
        page.fill("#email", "jane@example.com")

    if page.locator('button[type="submit"]').count():
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")

    page.screenshot(path="/tmp/static_page_after.png", full_page=True)
    browser.close()

print("Static HTML automation completed.")
