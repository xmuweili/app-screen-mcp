# MCPDemo — iOS Demo App

A minimal SwiftUI app that exercises every tool in the `app-screen-mcp` MCP server.

## Sections & what they demonstrate

| Section | MCP tool(s) |
|---|---|
| **Counter** (+/- buttons) | `tap`, `tap_text`, `get_ui_tree` |
| **Text Input** (field + Submit) | `type_text`, `find_elements`, `tap_text` |
| **Background Color** (5 buttons) | `tap_text`, `take_screenshot` |
| **Toggle** (on/off switch) | `tap`, `get_ui_tree` |
| **Item List** (20 rows, scrollable) | `swipe`, `find_elements`, `tap_text` |
| **Status banner** | `get_ui_tree` (reads `lastAction`) |
| *(device)* | `press_button(HOME)`, `press_button(LOCK)` |

## Quick start

### Option A — xcodegen (fastest)

```bash
brew install xcodegen
cd demo-app
xcodegen generate --spec project.yml
open MCPDemo.xcodeproj
```

### Option B — Manual Xcode

1. Open Xcode → **File › New › Project**
2. Choose **iOS › App**
   - Product Name: `MCPDemo`
   - Interface: `SwiftUI` | Language: `Swift`
3. Save inside this `demo-app/` folder
4. Delete the generated `ContentView.swift`
5. Drag `MCPDemo/MCPDemoApp.swift` and `MCPDemo/ContentView.swift` into the project navigator (check "Copy items if needed")
6. Select an iPhone simulator → **▶ Run**

## Example MCP session

```
# 1. See what's on screen
take_screenshot()

# 2. Inspect the full UI tree
get_ui_tree()

# 3. Find the Increment button
find_elements("Increment")

# 4. Tap it three times by label
tap_text("Increment")
tap_text("Increment")
tap_text("Increment")

# 5. Fill the text field
find_elements("textInput")   # get coordinates
type_text("Hello from MCP!")

# 6. Submit
tap_text("Submit")

# 7. Change background
tap_text("Blue")
take_screenshot()            # verify colour change

# 8. Toggle the switch
tap_text("Switch is OFF")    # or use tap(x, y) from ui_tree coords

# 9. Scroll down the list
swipe(200, 600, 200, 100, 400)

# 10. Tap a list item by label
tap_text("Item 15")

# 11. Read the status banner
find_elements("lastAction")

# 12. Go home
press_button("HOME")
```
