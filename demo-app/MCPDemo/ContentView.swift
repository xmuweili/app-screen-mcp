import SwiftUI

// MARK: - Root

struct ContentView: View {
    @StateObject private var store = AppStore()

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                HomeTab()
                    .opacity(store.selectedTab == .home     ? 1 : 0)
                    .accessibilityHidden(store.selectedTab != .home)
                ControlsTab()
                    .opacity(store.selectedTab == .controls ? 1 : 0)
                    .accessibilityHidden(store.selectedTab != .controls)
                ListTab()
                    .opacity(store.selectedTab == .list     ? 1 : 0)
                    .accessibilityHidden(store.selectedTab != .list)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            CustomTabBar()
        }
        .ignoresSafeArea(edges: .bottom)
        .environmentObject(store)
    }
}

// MARK: - Tab enum & Store

enum Tab: String { case home, controls, list }

final class AppStore: ObservableObject {
    @Published var selectedTab: Tab = .home
    @Published var lastAction   = "No actions yet"
    @Published var count        = 0
    @Published var inputText    = ""
    @Published var submitted: [String] = []
    @Published var accentColor: NamedColor = .indigo
    @Published var toggleOn     = false

    func record(_ s: String) { lastAction = s }
}

struct NamedColor: Equatable {
    let id: String; let name: String; let color: Color
    static let indigo  = NamedColor(id: "indigo",  name: "Indigo",  color: .indigo)
    static let coral   = NamedColor(id: "coral",   name: "Coral",   color: Color(red:1, green:0.37, blue:0.34))
    static let teal    = NamedColor(id: "teal",    name: "Teal",    color: .teal)
    static let orange  = NamedColor(id: "orange",  name: "Orange",  color: .orange)
    static let purple  = NamedColor(id: "purple",  name: "Purple",  color: .purple)
    static let all: [NamedColor] = [.indigo,.coral,.teal,.orange,.purple]
}

// MARK: - Custom Tab Bar  (IDs: tab_home / tab_controls / tab_list)

struct CustomTabBar: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        HStack(spacing: 0) {
            TabBarBtn(tab: .home,     icon: "house.fill",           label: "Home",     id: "tab_home")
            TabBarBtn(tab: .controls, icon: "slider.horizontal.3",  label: "Controls", id: "tab_controls")
            TabBarBtn(tab: .list,     icon: "list.bullet",           label: "List",     id: "tab_list")
        }
        .frame(maxWidth: .infinity)
        .frame(height: 56)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .top)
        .safeAreaPadding(.bottom)
    }
}

struct TabBarBtn: View {
    @EnvironmentObject var store: AppStore
    let tab: Tab; let icon: String; let label: String; let id: String
    var selected: Bool { store.selectedTab == tab }

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) { store.selectedTab = tab }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: selected ? .semibold : .regular))
                Text(label)
                    .font(.system(size: 10, weight: selected ? .semibold : .regular))
            }
            .foregroundStyle(selected ? store.accentColor.color : .secondary)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        .accessibilityLabel(label)
    }
}

// MARK: - Home Tab

struct HomeTab: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    HeroCard()
                    LastActionCard()
                    QuickActionsSection()
                    StatsSection()
                    Spacer(minLength: 8)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 20)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("MCP Demo")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

struct HeroCard: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [store.accentColor.color,
                                    store.accentColor.color.opacity(0.7)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .clipShape(RoundedRectangle(cornerRadius: 24))
            Circle().fill(.white.opacity(0.08)).frame(width: 160).offset(x: 180, y: -20)
            Circle().fill(.white.opacity(0.06)).frame(width: 100).offset(x: 240, y: 30)
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "cpu").font(.system(size: 36)).foregroundStyle(.white.opacity(0.9))
                Text("iOS Automation\nPlayground").font(.title2.bold()).foregroundStyle(.white).lineSpacing(2)
                Text("Explore MCP tool capabilities").font(.subheadline).foregroundStyle(.white.opacity(0.8))
            }.padding(24)
        }
        .frame(maxWidth: .infinity).frame(height: 180)
        .accessibilityIdentifier("home_hero")
    }
}

struct LastActionCard: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Last Action", systemImage: "bolt.fill")
                .font(.caption.bold()).foregroundStyle(.secondary).textCase(.uppercase)
            Text(store.lastAction)
                .font(.system(.body, design: .monospaced))
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("home_last_action")
                .accessibilityLabel("Last action: \(store.lastAction)")
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }
}

struct QuickActionsSection: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Quick Actions", icon: "bolt.fill")
            HStack(spacing: 12) {
                QuickBtn(icon: "plus.circle.fill",         label: "Increment", color: .green,  id: "home_increment") {
                    store.count += 1; store.record("Incremented → \(store.count)")
                }
                QuickBtn(icon: "minus.circle.fill",        label: "Decrement", color: .red,    id: "home_decrement") {
                    store.count -= 1; store.record("Decremented → \(store.count)")
                }
                QuickBtn(icon: "arrow.counterclockwise",   label: "Reset",     color: .orange, id: "home_reset") {
                    store.count = 0; store.record("Counter reset")
                }
            }
        }
    }
}

struct QuickBtn: View {
    let icon: String; let label: String; let color: Color; let id: String; let action: () -> Void
    @State private var pressed = false
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 26)).foregroundStyle(color)
                Text(label).font(.caption.bold()).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 16)
            .background(.background, in: RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
            .scaleEffect(pressed ? 0.95 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        ._onButtonGesture(pressing: { pressed = $0 }, perform: {})
    }
}

struct StatsSection: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Stats", icon: "chart.bar.fill")
            HStack(spacing: 12) {
                StatCard(title: "Counter",   value: "\(store.count)",               icon: "number.circle.fill", color: .indigo,                  id: "home_stat_counter")
                StatCard(title: "Submitted", value: "\(store.submitted.count)",     icon: "text.bubble.fill",   color: .teal,                    id: "home_stat_submitted")
                StatCard(title: "Toggle",    value: store.toggleOn ? "ON" : "OFF",  icon: "switch.2",           color: store.toggleOn ? .green : .gray, id: "home_stat_toggle")
            }
        }
    }
}

struct StatCard: View {
    let title: String; let value: String; let icon: String; let color: Color; let id: String
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 20)).foregroundStyle(color)
            Text(value).font(.title3.bold())
                .accessibilityIdentifier(id + "_value")
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
        .accessibilityIdentifier(id)
    }
}

// MARK: - Controls Tab

struct ControlsTab: View {
    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    CounterSection()
                    TextInputSection()
                    ThemeSection()
                    ToggleSection()
                    Spacer(minLength: 8)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 20)
            }
            .contentMargins(.bottom, 8, for: .scrollContent)
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("Controls")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

struct CounterSection: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        CardSection(title: "Counter", icon: "plusminus") {
            HStack(alignment: .center, spacing: 0) {
                CircleBtn(icon: "minus", color: .red,   id: "ctrl_decrement") {
                    store.count -= 1; store.record("Decremented → \(store.count)")
                }
                Spacer()
                Text("\(store.count)")
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3), value: store.count)
                    .accessibilityIdentifier("ctrl_counter_value")
                    .accessibilityLabel("Counter value \(store.count)")
                Spacer()
                CircleBtn(icon: "plus", color: .green, id: "ctrl_increment") {
                    store.count += 1; store.record("Incremented → \(store.count)")
                }
            }
            .padding(.vertical, 8)
        }
    }
}

struct CircleBtn: View {
    let icon: String; let color: Color; let id: String; let action: () -> Void
    @State private var pressed = false
    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(color.gradient, in: Circle())
                .shadow(color: color.opacity(0.4), radius: 8, y: 4)
                .scaleEffect(pressed ? 0.92 : 1)
                .animation(.spring(response: 0.2), value: pressed)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        ._onButtonGesture(pressing: { pressed = $0 }, perform: {})
    }
}

struct TextInputSection: View {
    @EnvironmentObject var store: AppStore
    @FocusState private var focused: Bool
    var body: some View {
        CardSection(title: "Text Input", icon: "keyboard") {
            VStack(spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "pencil").foregroundStyle(.secondary)
                    TextField("Type something…", text: $store.inputText)
                        .focused($focused)
                        .autocorrectionDisabled(true)
                        .accessibilityIdentifier("ctrl_text_input")
                    if !store.inputText.isEmpty {
                        Button { store.inputText = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .accessibilityIdentifier("ctrl_text_clear")
                    }
                }
                .padding(12)
                .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12)
                    .stroke(focused ? store.accentColor.color : Color(.separator),
                            lineWidth: focused ? 2 : 1))
                .animation(.easeInOut(duration: 0.2), value: focused)

                PrimaryBtn(
                    label: "Submit", icon: "paperplane.fill",
                    color: store.accentColor.color, id: "ctrl_submit",
                    disabled: store.inputText.trimmingCharacters(in: .whitespaces).isEmpty
                ) {
                    let t = store.inputText.trimmingCharacters(in: .whitespaces)
                    store.submitted.insert(t, at: 0)
                    store.record("Submitted: \"\(t)\"")
                    store.inputText = ""; focused = false
                }

                if !store.submitted.isEmpty {
                    VStack(spacing: 6) {
                        ForEach(store.submitted.prefix(3), id: \.self) { t in
                            HStack {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).font(.caption)
                                Text(t).font(.subheadline)
                                    .accessibilityIdentifier("ctrl_submitted_text")
                                Spacer()
                            }.padding(.horizontal, 4)
                        }
                    }.transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }
}

struct PrimaryBtn: View {
    let label: String; let icon: String; let color: Color; let id: String
    var disabled: Bool = false; let action: () -> Void
    @State private var pressed = false
    var body: some View {
        Button(action: action) {
            Label(label, systemImage: icon).font(.body.bold()).foregroundStyle(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 14)
                    .fill(disabled ? AnyShapeStyle(Color.gray.opacity(0.4)) : AnyShapeStyle(color.gradient)))
                .shadow(color: disabled ? .clear : color.opacity(0.35), radius: 8, y: 4)
                .scaleEffect(pressed ? 0.97 : 1)
                .animation(.spring(response: 0.2), value: pressed)
        }
        .buttonStyle(.plain).disabled(disabled)
        .accessibilityIdentifier(id)
        ._onButtonGesture(pressing: { if !disabled { pressed = $0 } }, perform: {})
    }
}

struct ThemeSection: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        CardSection(title: "Accent Color", icon: "paintpalette") {
            HStack(spacing: 0) {
                ForEach(NamedColor.all, id: \.id) { nc in
                    Button {
                        withAnimation(.spring(response: 0.3)) { store.accentColor = nc }
                        store.record("Theme → \(nc.name)")
                    } label: {
                        ZStack {
                            Circle().fill(nc.color.gradient).frame(width: 42, height: 42)
                                .shadow(color: nc.color.opacity(0.4), radius: 4, y: 2)
                            if store.accentColor == nc {
                                Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ctrl_color_\(nc.id)")
                    .accessibilityLabel("\(nc.name) color\(store.accentColor == nc ? ", selected" : "")")
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 4)
        }
    }
}

struct ToggleSection: View {
    @EnvironmentObject var store: AppStore
    var body: some View {
        CardSection(title: "Toggle", icon: "switch.2") {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.toggleOn ? "Enabled" : "Disabled").font(.body.bold())
                    Text(store.toggleOn ? "Feature is active" : "Tap to enable").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Toggle("", isOn: $store.toggleOn)
                    .labelsHidden()
                    .tint(store.accentColor.color)
                    .accessibilityIdentifier("ctrl_toggle")
                    .onChange(of: store.toggleOn) { _, v in store.record("Toggle → \(v ? "ON" : "OFF")") }
            }
        }
    }
}

// MARK: - List Tab

struct ListTab: View {
    @EnvironmentObject var store: AppStore
    @State private var searchText = ""

    var filtered: [Int] {
        let all = Array(1...20)
        return searchText.isEmpty ? all : all.filter { "Item \($0)".localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(filtered, id: \.self) { i in
                        ListRow(index: i)
                        if i != filtered.last { Divider().padding(.leading, 60) }
                    }
                }
                .background(.background, in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 20).padding(.top, 4).padding(.bottom, 20)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("List")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $searchText, prompt: "Search items…")
        }
    }
}

struct ListRow: View {
    @EnvironmentObject var store: AppStore
    let index: Int
    @State private var tapped = false

    private let icons  = ["star","heart","bolt","flame","leaf","moon","sun.max","cloud","drop","wind",
                          "snowflake","tornado","globe.americas","mountain.2","tree","bird","fish","ant","ladybug","pawprint"]
    private let colors: [Color] = [.indigo,.pink,.yellow,.orange,.green,.purple,.orange,.blue,.teal,.cyan,
                                   .indigo,.red,.blue,.brown,.green,.teal,.cyan,.orange,.red,.purple]

    var body: some View {
        Button {
            withAnimation(.spring(response: 0.2)) { tapped = true }
            store.record("Tapped Item \(index)")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { tapped = false }
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(colors[(index-1) % colors.count].opacity(0.15)).frame(width: 36, height: 36)
                    Image(systemName: icons[(index-1) % icons.count])
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(colors[(index-1) % colors.count])
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Item \(index)").font(.body.bold()).foregroundStyle(.primary)
                    Text("Tap to select").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(tapped ? Color(.systemFill) : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("list_item_\(index)")
        .accessibilityLabel("Item \(index)")
    }
}

// MARK: - Shared helpers

struct CardSection<Content: View>: View {
    let title: String; let icon: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title, icon: icon)
            content.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background(.background, in: RoundedRectangle(cornerRadius: 18))
                .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        }
    }
}

struct SectionHeader: View {
    let title: String; let icon: String?
    init(_ title: String, icon: String? = nil) { self.title = title; self.icon = icon }
    var body: some View {
        HStack(spacing: 6) {
            if let icon { Image(systemName: icon).foregroundStyle(.secondary) }
            Text(title).foregroundStyle(.secondary)
        }
        .font(.subheadline.bold()).textCase(.uppercase).kerning(0.5)
    }
}

#Preview { ContentView() }
