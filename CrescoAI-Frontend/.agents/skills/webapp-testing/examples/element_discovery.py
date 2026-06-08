from playwright.sync_api import sync_playwright


URL = "http://localhost:5173"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    buttons = page.locator("button").all()
    print(f"Found {len(buttons)} buttons:")
    for index, button in enumerate(buttons):
        text = button.inner_text().strip() if button.is_visible() else "[hidden]"
        print(f"  [{index}] {text}")

    links = page.locator("a[href]").all()
    print(f"\nFound {len(links)} links:")
    for link in links[:10]:
        text = link.inner_text().strip()
        href = link.get_attribute("href")
        print(f"  - {text} -> {href}")

    fields = page.locator("input, textarea, select").all()
    print(f"\nFound {len(fields)} input fields:")
    for field in fields:
        name = field.get_attribute("name") or field.get_attribute("id") or "[unnamed]"
        field_type = field.get_attribute("type") or field.evaluate("el => el.tagName.toLowerCase()")
        print(f"  - {name} ({field_type})")

    page.screenshot(path="/tmp/page_discovery.png", full_page=True)
    print("\nScreenshot saved to /tmp/page_discovery.png")

    browser.close()
