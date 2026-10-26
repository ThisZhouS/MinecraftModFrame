import { describe, expect, it } from "vitest";
import { exampleSpec, parseModSpec } from "@mcmodkit/core";
import { listAdapters, planProject, requireAdapter } from "../src/index.js";

const spec = exampleSpec();
const adapter = requireAdapter("1.21.1", "fabric");
const plan = planProject(spec, adapter);
const paths = plan.files.map((f) => f.path);

/**
 * Adapters may legitimately carry only a subset of the slices: UI/recipes/advancements/entities/
 * datagen are all-or-nothing, and the lint enforces that. A slice's templates are not
 * version-independent — 1.21.2 alone changed MobRenderer's type-variable arity and made
 * EntityType.Builder#build take a ResourceKey — so a newly added version starts without them and
 * gains them as each is ported and compile-verified.
 *
 * These tests therefore drive each adapter with a spec trimmed to what it actually declares, and a
 * separate test below pins that asking for an undeclared slice fails loudly instead of emitting
 * broken Java.
 */
function declares(a: ReturnType<typeof listAdapters>[number], key: string): boolean {
  return (a.templates as Record<string, string>)[key] !== undefined;
}

function specFor(a: ReturnType<typeof listAdapters>[number]) {
  const s = structuredClone(spec);
  if (!declares(a, "screenClass")) s.ui = { screens: [] };
  if (!declares(a, "recipeShaped")) s.content.recipes = [];
  if (!declares(a, "advancement")) s.content.advancements = [];
  if (!declares(a, "entityClass")) s.content.entities = [];
  if (!declares(a, "dataGenClass")) s.datagen = false;
  return s;
}

const planFor = (a: ReturnType<typeof listAdapters>[number]) => (a.id === adapter.id ? plan : planProject(specFor(a), a));

describe("fabric-1.21.1 adapter", () => {
  it("ships a runnable gradle wrapper as binary assets", () => {
    const jar = plan.files.find((f) => f.path === "gradle/wrapper/gradle-wrapper.jar");
    expect(jar).toBeDefined();
    expect(jar!.copyFrom).toMatch(/gradle-wrapper\.jar$/);
    expect(paths).toContain("gradlew");
    expect(paths).toContain("gradlew.bat");
    // gradlew must be marked executable so unix checkouts work.
    expect(plan.files.find((f) => f.path === "gradlew")!.executable).toBe(true);
  });

  it("uses the singular 1.21 datapack directories", () => {
    expect(paths).toContain("src/main/resources/data/examplemod/loot_table/blocks/ruby_ore.json");
    expect(paths).toContain("src/main/resources/data/minecraft/tags/block/mineable/pickaxe.json");
    // Pre-1.21 plural names fail silently in game - never emit them.
    expect(paths.some((p) => p.includes("loot_tables"))).toBe(false);
    expect(paths.some((p) => p.includes("tags/blocks"))).toBe(false);
  });

  it("places every java source next to the adapter-declared main class", () => {
    expect(paths).toContain("src/main/java/com/examplemod/ModMain.java");
    expect(paths).toContain("src/main/java/com/examplemod/ModMainItems.java");
    expect(paths).toContain("src/main/java/com/examplemod/ModMainBlocks.java");
  });

  it("routes a vanilla-group item into the vanilla tab and the rest into the mod tab", () => {
    const items = plan.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content;
    expect(items).toContain("ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.INGREDIENTS)");
    expect(items).toContain("TAB_ENTRIES.add(ModMainItems.CHARGED_RUBY);");
    expect(items).not.toContain("TAB_ENTRIES.add(ModMainItems.RUBY);");
  });

  it("renders version facts from the adapter, never hard-coded in templates", () => {
    expect(plan.files.find((f) => f.path === "gradle.properties")!.content).toContain("minecraft_version=1.21.1");
    const gradleProps = plan.files.find((f) => f.path === "build.gradle")!.content;
    // toVersion() rather than VERSION_<n>: Java 8 is VERSION_1_8 in Gradle, so a bare
    // "VERSION_" + version would emit VERSION_8 and fail on every Java 8 target.
    expect(gradleProps).toContain("JavaVersion.toVersion(21)");
    expect(gradleProps).not.toContain("1.21.1");
  });
});

describe("adapter data hygiene (principle 1: version facts only in adapters)", () => {
  it("no template hard-codes its own MC version outside placeholders", () => {
    for (const a of listAdapters()) {
      for (const [key, body] of Object.entries(a.templates)) {
        expect(body.includes(a.mcVersion), `${a.id}: template "${key}" hard-codes ${a.mcVersion}`).toBe(false);
      }
      // project paths are data too, but they must not embed a concrete version either.
      for (const f of a.projectFiles) {
        expect(f.path.includes(a.mcVersion), `${a.id}: path "${f.path}" hard-codes ${a.mcVersion}`).toBe(false);
      }
    }
  });

  it("every adapter renders cleanly for the example spec (no unrendered placeholders)", () => {
    // This is the strongest check available for adapters that cannot be compile-verified on this
    // machine: a template/vars mismatch shows up as a literal {{placeholder}} in emitted code.
    for (const a of listAdapters()) {
      const p = planFor(a);
      expect(p.files.length).toBeGreaterThan(20);
      for (const f of p.files) {
        const leftover = f.content.match(/\{\{[a-zA-Z_]+\}\}/g);
        expect(leftover, `${a.id}: ${f.path} has unrendered ${leftover?.[0]}`).toBeNull();
      }
    }
  });

  it("generates the UI slice for every adapter that declares it", () => {
    for (const a of listAdapters().filter((x) => declares(x, "screenClass"))) {
      const p = planFor(a);
      const paths = p.files.map((f) => f.path);
      expect(paths, `${a.id} should emit a client bootstrap`).toContain("src/main/java/com/examplemod/client/ModMainClient.java");
      expect(paths, `${a.id} should emit the screen class`).toContain("src/main/java/com/examplemod/client/ModMainGuideScreen.java");
      const boot = p.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
      expect(boot).toContain("KEY_GUIDE");
      expect(boot).toContain("ModMainGuideScreen");
      const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
      expect(lang["examplemod.screen.guide.title"]).toBe("Example Mod Guide");
      expect(lang["examplemod.key.guide"]).toBe("Open Example Mod Guide");
    }
  });

  it("points NeoForge projects at the reachable CDN and synthesizes the missing dependency module", () => {
    // maven.neoforged.net is unreachable on some networks and Gradle fails hard on an unreachable
    // repository instead of falling through. NeoForged's CDN mirrors it except for the synthetic
    // net.neoforged:minecraft-dependencies module, which settings.gradle rebuilds from Mojang's
    // version manifest; without it the NeoForm runtime falls back to downloading every Minecraft
    // library from the official host. Both halves are load-bearing.
    for (const a of listAdapters().filter((x) => x.loader === "neoforge")) {
      expect(a.templates.settingsGradle, a.id).toContain("https://neoforged.forgecdn.net/releases");
      expect(a.templates.settingsGradle, a.id).not.toContain("url = 'https://maven.neoforged.net");
      expect(a.templates.settingsGradle, a.id).toContain("minecraft-dependencies");
      expect(a.templates.settingsGradle, a.id).toContain("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    }
  });

  it("pins NFRT's userdev library versions on 1.20.4", () => {
    // NFRT 2.x recompiles Minecraft from NeoForge's userdev config, which pins exact library
    // versions (guava 31.1-jre, commons-io 2.11.0, ...). Gradle conflict resolution upgrades
    // several of them, so the exact versions never reach ModDevGradle's artifact manifest and NFRT
    // falls back to downloading them from maven.neoforged.net - unreachable on some networks.
    const a = new Map(listAdapters().map((x) => [x.id, x])).get("neoforge-1.20.4")!;
    expect(a.gradle.mdgVersion).toMatch(/^2\./);
    expect(a.templates.buildGradle).toContain("addArtifactsToManifest");
    expect(a.templates.buildGradle).toContain("commons-io:commons-io:2.11.0");
    expect(a.templates.buildGradle).toContain("net.neoforged:mergetool:2.0.0:api");
  });

  it("sets registry ids in the 1.21.4 item and block properties", () => {
    // 1.21.2+ validates that every Item/Block knows its registry id at construction. Without setId
    // the dedicated server dies with "Item id not set" / "Block id not set"; the compiler accepts
    // it, so pin the templates here.
    const a = new Map(listAdapters().map((x) => [x.id, x])).get("neoforge-1.21.4")!;
    expect(a.templates.itemSettings).toContain("setId(ResourceKey.create(Registries.ITEM");
    expect(a.templates.itemSettingsMaxCount).toContain("setId(ResourceKey.create(Registries.ITEM");
    expect(a.templates.blockSettings).toContain("setId(ResourceKey.create(Registries.BLOCK");
    expect(a.templates.blockSettingsNoTool).toContain("setId(ResourceKey.create(Registries.BLOCK");
    expect(a.templates.blocksRegistryClass).toContain("import net.minecraft.core.registries.Registries;");
    expect(a.templates.blocksRegistryClass).toContain("import net.minecraft.resources.ResourceKey;");
  });

  it("uses the pre-1.21 plural datapack directories on 1.20.4", () => {
    // The singular flattening landed in 1.21. A 1.20.4 mod shipping loot_table/ loads silently
    // nothing - no compile error, no crash.
    const a = new Map(listAdapters().map((x) => [x.id, x])).get("neoforge-1.20.4")!;
    expect(a.contentPaths.lootTable).toContain("/loot_tables/blocks/");
    expect(a.contentPaths.mineableTag).toContain("/tags/blocks/mineable/");
  });

  it("names the mod metadata file per FML generation", () => {
    // FML 2.x (NeoForge 1.20.4) only scans META-INF/mods.toml; the neoforge.mods.toml rename
    // landed with NeoForge 20.5/1.21. Getting this wrong is silent: the server boots happily and
    // never loads the mod - verified at runtime, so pin it here.
    const byId = new Map(listAdapters().map((x) => [x.id, x]));
    const metadataPath = (id: string) => byId.get(id)!.projectFiles.find((f) => f.template === "modsToml")!.path;
    expect(metadataPath("neoforge-1.20.4")).toContain("META-INF/mods.toml");
    expect(metadataPath("neoforge-1.21.1")).toContain("META-INF/neoforge.mods.toml");
    expect(metadataPath("neoforge-1.21.4")).toContain("META-INF/neoforge.mods.toml");
  });

  it("declares the FML 2.x javafml language version on 1.20.4", () => {
    // FML 2.0.17 (NeoForge 1.20.4) provides javafml language version 2.0; "[4,)" is rejected at
    // load time with "Missing language javafml version [4,) wanted by main, found 2.0" - the mod
    // is discovered but silently never loaded. Verified at runtime, so pin it here.
    // The template must CONSUME the gradle fact: a hardcoded range is how the values drifted apart.
    const byId = new Map(listAdapters().map((x) => [x.id, x]));
    expect(byId.get("neoforge-1.20.4")!.gradle.fmlLoaderVersionRange).toBe("[2,)");
    expect(byId.get("neoforge-1.20.4")!.templates.modsToml).toContain('loaderVersion = "{{gradle_fmlLoaderVersionRange}}"');
    expect(byId.get("neoforge-1.21.1")!.templates.modsToml).toContain('loaderVersion = "{{gradle_fmlLoaderVersionRange}}"');
  });

  it("keeps the renderBackground signature version-correct in screen templates", () => {
    // Verified with javap against the real mapped jars: 1.20.1 takes (GuiGraphics), 1.21.x takes
    // (GuiGraphics, int, int, float). Getting this wrong is a compile error, so pin it here too.
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    expect(byId.get("forge-1.20.1")!.templates.screenClass).toContain("renderBackground(guiGraphics);");
    for (const id of ["fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"]) {
      // javap: renderBackground(GuiGraphics,int,int,float) is shared by every 1.20.2+ mapped jar.
      expect(byId.get(id)!.templates.screenClass, id).toContain("renderBackground(guiGraphics, mouseX, mouseY, partialTick);");
    }
  });

  it("keeps the scroll signature version-correct and draws the background only once", () => {
    // 1.20.1: mouseScrolled(x, y, delta); 1.21.1 added a horizontal axis. Also pin the 1.21 render
    // trap: Screen.render re-renders the background, so a template that draws its panel and then
    // calls super.render paints the panel over (and pays for two background passes).
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    const screens: [string, string][] = [
      ["forge-1.20.1", "mouseScrolled(double mouseX, double mouseY, double delta)"],
      ["fabric-1.20.4", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["fabric-1.21.1", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["fabric-1.21.4", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["forge-1.20.4", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["forge-1.21.4", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["neoforge-1.20.4", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["neoforge-1.21.1", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
      ["neoforge-1.21.4", "mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY)"],
    ];
    for (const [id, signature] of screens) {
      const template = byId.get(id)!.templates.screenClass;
      expect(template, id).toContain(signature);
      expect(template.match(/renderBackground\(/g), id).toHaveLength(1);
      expect(template, id).not.toContain("super.render(");
      expect(template, id).toContain("this.children()");
      expect(template, id).toContain("this.font.split(");
      // Input layer: same signatures in 1.20.1 and 1.21.1 (javap: GuiEventListener defaults plus
      // Screen#keyPressed). Pinned so a port cannot silently drop drag/keyboard scrolling.
      expect(template, id).toContain("mouseDragged(double mouseX, double mouseY, int button, double dragX, double dragY)");
      expect(template, id).toContain("mouseReleased(double mouseX, double mouseY, int button)");
      expect(template, id).toContain("keyPressed(int keyCode, int scanCode, int modifiers)");
      expect(template, id).toContain("GLFW.GLFW_KEY_PAGE_DOWN");
      expect(template, id).toContain("scrollToMouse(");
      expect(template, id).toContain("draggingScrollbar");
    }
  });

  it("uses each NeoForge line's own client-tick event", () => {
    // javap on the universal jars: 1.20.4 fires the fused TickEvent.ClientTickEvent and annotates
    // with the nested Mod.EventBusSubscriber; 1.20.5+ split the tick into ClientTickEvent.Post and
    // promoted EventBusSubscriber to a top-level type. Copying the 1.21 bootstrap to 1.20.4 does not
    // compile - the first UI port hit exactly that.
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    const old = byId.get("neoforge-1.20.4")!.templates.clientBootstrap;
    expect(old).toContain("import net.neoforged.neoforge.event.TickEvent;");
    expect(old).toContain("TickEvent.ClientTickEvent event");
    expect(old).toContain("event.phase != TickEvent.Phase.END");
    expect(old).toContain("@Mod.EventBusSubscriber(");
    expect(old).not.toContain("void onClientTick(ClientTickEvent.Post");
    for (const id of ["neoforge-1.21.1", "neoforge-1.21.4"]) {
      const boot = byId.get(id)!.templates.clientBootstrap;
      expect(boot, id).toContain("import net.neoforged.neoforge.client.event.ClientTickEvent;");
      expect(boot, id).toContain("ClientTickEvent.Post event");
      expect(boot, id).toContain("import net.neoforged.fml.common.EventBusSubscriber;");
    }
  });

  it("smooth-scrolls, keeps its position and highlights the scrollbar in every screen template", () => {
    // UI 2.1 interaction layer. The position must survive init() because returning from a linked
    // screen or resizing calls init() again; easing must be skipped while dragging so the thumb
    // stays under the pointer.
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"]) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("SCROLL_ANIMATION_MS = 140");
      expect(t, id).toContain("private int currentScroll()");
      expect(t, id).toContain("private void scrollTo(int target, boolean animate)");
      expect(t, id).toContain("this.scrollTo(this.scrollTarget - (int)");
      expect(t, id).toContain("hoveringScrollbar");
      expect(t, id).toContain("int trackWidth = this.hoveringScrollbar || this.draggingScrollbar ? 4 : 2;");
      expect(t, id).toContain("int anchorScroll = Math.max(0, this.currentScroll());");
      expect(t, id).toContain("int anchorLine = this.lineForScroll(anchorScroll);");
      expect(t, id).toContain("this.scrollOffset = Math.min(row * LINE_HEIGHT + anchorPixel, this.maxScroll());");
      expect(t, id).not.toContain("this.scrollOffset = Math.min(this.currentScroll(), this.maxScroll());");
      expect(t, id).toContain("this.scrollTo(this.scrollbarScrollAt(mouseY, this.scrollbarGrabOffset), false);");
      expect(t, id).toContain("int scroll = this.currentScroll();");
      // UI 2.3 / 18.0: a resize rebuilds this screen and calls init() again, so keep the interpolated
      // position (not the stale field) as a logical-line anchor, and never replay the entrance on a rebuild.
      expect(t, id).toContain("private long openedAt = -1L;");
      expect(t, id).toContain("if (this.openedAt < 0L) {");
      expect(t, id).toContain('private String displayTitle = "";');
      expect(t, id).toContain("this.displayTitle = this.trimmedTitle();");
      expect(t, id).toContain("return this.font.plainSubstrByWidth(full, available) + ellipsis;");
      expect(t, id).toContain("guiGraphics.drawCenteredString(this.font, this.displayTitle,");
    }
  });

  it("keeps the scrollbar thumb under the pointer while dragging", () => {
    // UI 16.0: pressing the track used to snap the thumb centre under the cursor, and dragging from
    // the thumb inherited that jump. A grab offset fixes both: a thumb press preserves the pixel
    // the player grabbed, a track press still centres the thumb, and draw/hit/drag share geometry.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private int scrollbarGrabOffset = -1;");
      expect(t, id).toContain("private int scrollbarThumbHeight() {");
      expect(t, id).toContain("private int scrollbarThumbTop(int bodyTop) {");
      expect(t, id).toContain("private int scrollbarThumbTop() {");
      expect(t, id).toContain("int thumbHeight = this.scrollbarThumbHeight();");
      expect(t, id).toContain("int thumbTop = this.scrollbarThumbTop(bodyTop);");
      expect(t, id).toContain("boolean onThumb = mouseY >= thumbTop && mouseY < thumbTop + thumbHeight;");
      expect(t, id).toContain("this.scrollbarGrabOffset = onThumb ? (int) Math.round(mouseY) - thumbTop : thumbHeight / 2;");
      expect(t, id).toContain("double grab = grabOffset >= 0 ? grabOffset : thumbHeight / 2.0D;");
      expect(t, id).toContain("double ratio = (mouseY - bodyTop - grab) / (trackHeight - thumbHeight);");
      // init + both mouseReleased branches must drop the grab, or the next drag starts offset.
      expect(t, id).toContain("this.draggingScrollbar = false;\n\t\tthis.scrollbarGrabOffset = -1;");
      expect((t.match(/this\.scrollbarGrabOffset = -1;/g) ?? []).length, id).toBe(3);
    }
  });

  it("hits links only where the row text is painted", () => {
    // UI 17.0: hover highlight and underline always covered just the text, but the click hot zone
    // was the whole panel width, so clicking empty space beside a short link opened a screen.
    // Matching the hit test to the cached row rect removes that invisible target while keyboard
    // focus still walks logical lines.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("int link = this.rowLinks.get(row);");
      expect(t, id).toContain("if (link < 0) {");
      expect(t, id).toContain("int rowLeft = CENTER_TEXT");
      expect(t, id).toContain(": left + BODY_SIDE + this.rowIndents.get(row);");
      expect(t, id).toContain("return mouseX >= rowLeft - 2 && mouseX <= rowLeft + this.rowWidths.get(row) + 2 ? link : -1;");
      expect(t, id).not.toContain("return this.rowLinks.get(row);");
    }
  });

  it("anchors the reading position to logical lines across resize and reopen", () => {
    // UI 18.0: a resize re-wraps the text, so restoring the raw pixel offset lands in a different
    // paragraph; a fresh instance also used to reopen at the top. init() now carries the top logical
    // line (and the row/pixel offset inside it), and the template remembers the last scrolled line
    // as a static so closing and reopening the guide resumes reading later in the same session.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static int rememberedLine = -1;");
      expect(t, id).toContain("private boolean laidOut;");
      expect(t, id).toContain("private int lineForScroll(int scroll)");
      expect(t, id).toContain("while (line > 0 && this.lineStarts.get(line) > row)");
      expect(t, id).toContain("anchorRow = topRow - this.lineStarts.get(anchorLine);");
      expect(t, id).toContain("anchorPixel = anchorScroll % LINE_HEIGHT;");
      expect(t, id).toContain(
        "int row = Math.min(this.lineStarts.get(line) + anchorRow, Math.max(this.lineStarts.get(line), lineEnd - 1));",
      );
      expect(t, id).toContain("!this.laidOut && this.initialLine < 0 && rememberedLine >= 0 && !this.lineStarts.isEmpty()");
      expect(t, id).toContain(
        "this.scrollOffset = Math.min(this.lineStarts.get(Math.min(rememberedLine, this.lineStarts.size() - 1)) * LINE_HEIGHT, this.maxScroll());",
      );
      expect(t, id).toContain("this.laidOut = true;");
      expect(t, id).toContain("rememberedLine = this.lineForScroll(clamped);");
      // A deep link still wins: the remembered restore runs first and scrollToLine() overrides it.
      expect(t.indexOf("!this.laidOut && this.initialLine < 0")).toBeLessThan(t.indexOf("if (this.initialLine >= 0) {"));
    }
  });

  it("drops keyboard link focus when the player scrolls manually", () => {
    // UI 18.1: wheel/PageUp/PageDown/Home/End scrolled the body but kept focusedLink. Once that row
    // left the viewport, Enter still opened an invisible link and the focus tooltip could be clamped
    // to a screen edge. Manual scrolls now clear focus; focusLink()'s ensureLineVisible() scroll is
    // untouched, so keyboard navigation still auto-scrolls the selected row into view.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("A manual scroll ends keyboard link navigation");
      expect(t, id).toMatch(
        /this\.focusedLink = -1;\n\t\t\tthis\.pressedLink = -1;\n\t\t\tthis\.scrollTo\(this\.scrollTarget - \(int\) \((?:scrollY|delta) \* SCROLL_STEP\), true\);/,
      );
      expect(t, id).toContain("this.focusedLink = -1;\n\t\t\t\tthis.scrollTo(this.scrollTarget - this.pageStep(), true);");
      expect(t, id).toContain("this.focusedLink = -1;\n\t\t\t\tthis.scrollTo(this.scrollTarget + this.pageStep(), true);");
      expect(t, id).toContain("this.focusedLink = -1;\n\t\t\t\tthis.scrollTo(0, true, this.scrollDurationFor(0));");
      expect(t, id).toContain("this.focusedLink = -1;\n\t\t\t\tthis.scrollTo(maxScroll, true, this.scrollDurationFor(maxScroll));");
      // The clear lives in input handlers; the focus helper's own scroll must keep the focus.
      expect(t, id).toContain("private void ensureLineVisible(int line) {");
      expect(t, id).toContain("this.focusedLink = line;\n\t\t\t\tthis.ensureLineVisible(line);");
    }
  });

  it("commits inline link clicks on release like vanilla buttons", () => {
    // UI 19.0: links used to navigate on mouse press, so starting a drag on a link opened the target
    // before the player could change their mind and there was no way to cancel. Commit on release
    // over the same row instead; scrolling, typing, resize and close all drop the pending press.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private int pressedLink = -1;");
      expect(t, id).toContain("this.hoveredLink = -1;\n\t\tthis.focusedLink = -1;\n\t\tthis.pressedLink = -1;");
      // A press only remembers the row; the target opens from mouseReleased after a hit test.
      expect(t, id).toContain("// Like a vanilla button, a link commits on release so dragging off cancels the click.\n\t\t\t\tthis.pressedLink = line;");
      expect(t, id).not.toContain("this.openLineLink(line);");
      expect(t, id).toContain("int pressed = this.pressedLink;");
      expect(t, id).toContain("this.linkAt(mouseX, mouseY) == pressed");
      expect(t, id).toContain("this.openLineLink(pressed);");
      const release = t.indexOf("public boolean mouseReleased");
      const hit = t.indexOf("this.linkAt(mouseX, mouseY) == pressed", release);
      const open = t.indexOf("this.openLineLink(pressed);", release);
      expect(hit, id).toBeGreaterThan(release);
      expect(open, id).toBeGreaterThan(hit);
      // Both early returns (close transition, scrollbar drag) drop the pending link press.
      expect(t.slice(release, hit), id).toContain("this.pressedLink = -1;\n\t\t\treturn true;");
      // Manual scrolls and any key press cancel a held link, so release cannot open it later.
      expect(t, id).toMatch(
        /this\.focusedLink = -1;\n\t\t\tthis\.pressedLink = -1;\n\t\t\tthis\.scrollTo\(this\.scrollTarget - \(int\) \((?:scrollY|delta) \* SCROLL_STEP\), true\);/,
      );
      expect(t, id).toContain("// Any key cancels a pending link press; only a press/release pair on the row opens it.\n\t\tthis.pressedLink = -1;\n\t\tint maxScroll = this.maxScroll();");
    }
  });

  it("maps headings onto the scrollbar track in every screen template", () => {
    // UI 20.0: the thumb showed where the reader was but not what the book contains, so a long guide
    // felt like undifferentiated text when scrolled. Heading rows are cached during layout and drawn
    // as ticks beside the track; the section at the top of the viewport gets the full accent.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private final List<Integer> headingRows = new ArrayList<>();");
      expect(t, id).toContain("this.headingRows.clear();");
      // Only the first visual row of a heading marks its section, so wrapped headings stay one tick.
      expect(t, id).toContain(
        "this.rowStarts.add(first);\n\t\t\t\tthis.rowLinks.add(LINE_LINKS[line]);\n\t\t\t\tthis.rowStepTexts.add(first ? STEP_TEXT[line] : \"\");\n\t\t\t\tif (first && style == 1) {\n\t\t\t\t\tthis.headingRows.add(this.rows.size() - 1);\n\t\t\t\t\tthis.headingLines.add(line);\n\t\t\t\t\tthis.headingTooltips.add(Component.translatable(LINE_KEYS[line]));\n\t\t\t\t}",
      );
      expect(t, id).toContain("int currentHeading = this.currentHeading(scroll);");
      expect(t, id).toContain("int tickTop = bodyTop + row * trackHeight / rowCount;");
      expect(t, id).toContain("int tickWidth = hovered ? 7 : current ? 5 : 3;");
      expect(t, id).toContain("guiGraphics.fill(x - tickWidth, tickTop, x, tickTop + 1,");
      expect(t, id).toContain("private int currentHeading(int scroll)");
      expect(t, id).toContain("if (row * LINE_HEIGHT > scroll) {\n\t\t\t\tbreak;\n\t\t\t}");
      // Track, then ticks, then thumb: the thumb stays the top-most affordance.
      const track = t.indexOf("guiGraphics.fill(x, bodyTop, x + trackWidth, bodyTop + trackHeight, BORDER_COLOR);");
      const ticks = t.indexOf("int currentHeading = this.currentHeading(scroll);", track);
      const thumb = t.indexOf("guiGraphics.fill(x, thumbTop, x + trackWidth, thumbTop + thumbHeight, ACCENT_COLOR);", track);
      expect(track, id).toBeGreaterThanOrEqual(0);
      expect(ticks, id).toBeGreaterThan(track);
      expect(thumb, id).toBeGreaterThan(ticks);
      // A page that fits keeps the body full-width; ticks only exist alongside a scrollbar.
      expect(t, id).toContain("if (maxScroll > 0) {\n\t\t\tint trackHeight = viewport;");
    }
  });

  it("steps between headings with Ctrl+Up/Down in every screen template", () => {
    // UI 21.0: ticks show where sections are, but reaching one still meant dragging or paging.
    // Ctrl+Up/Down walks the same cached heading rows and lands with the anchor flash, so the
    // reader sees both where they arrived and which tick is current.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private int headingStep(boolean forward)");
      expect(t, id).toContain("int current = this.currentHeading(this.scrollTarget);");
      expect(t, id).toContain("if (row > current) {\n\t\t\t\t\treturn row;");
      expect(t, id).toContain("int row = this.headingStep(keyCode == GLFW.GLFW_KEY_DOWN);");
      expect(t, id).toContain("this.scrollToLine(this.lineForScroll(row * LINE_HEIGHT));");
      // Ctrl+arrow wins over link focus and is consumed even at the first/last section.
      const ctrl = t.indexOf("Screen.hasControlDown()");
      const scrollBranch = t.indexOf("if (maxScroll > 0) {");
      const links = t.indexOf("if (this.hasLinks) {");
      expect(ctrl, id).toBeGreaterThan(scrollBranch);
      expect(ctrl, id).toBeLessThan(links);
      expect(t, id).toContain("this.focusedLink = -1;\n\t\t\t\tint row = this.headingStep");
      // The landing flash is the one anchor jumps already use.
      expect(t, id).toContain("this.flashLine = line;");
      expect(t, id).toContain("int target = this.lineStarts.get(line) * LINE_HEIGHT;\n\t\tthis.scrollTo(target, true, this.scrollDurationFor(target));");
    }
  });

  it("scales scroll duration with jump distance in every screen template", () => {
    // UI 22.0: a deep link, Ctrl section jump, Home/End or back-to-top link used to cross the whole
    // document in the same 140 ms as a wheel notch, which read as a teleport. Jump duration now
    // grows with distance up to 280 ms; wheel/page steps and link auto-scroll keep the base pace so
    // repeated input stays responsive.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int MAX_SCROLL_ANIMATION_MS = 280;");
      expect(t, id).toContain("private int scrollDurationMs = SCROLL_ANIMATION_MS;");
      expect(t, id).toContain("if (elapsed >= this.scrollDurationMs) {");
      expect(t, id).toContain("float t = Math.max(0.0F, elapsed / (float) this.scrollDurationMs);");
      // The two-argument form keeps the base pace for wheel, page and link auto-scroll callers.
      expect(t, id).toContain(
        "private void scrollTo(int target, boolean animate) {\n\t\tthis.scrollTo(target, animate, SCROLL_ANIMATION_MS);\n\t}",
      );
      expect(t, id).toContain("private int scrollDurationFor(int target) {");
      expect(t, id).toContain("int distance = Math.abs(clamped - this.scrollTarget);");
      expect(t, id).toContain("return Math.min(MAX_SCROLL_ANIMATION_MS, SCROLL_ANIMATION_MS + distance / 12);");
      expect(t, id).toContain(
        "this.scrollDurationMs = Math.max(SCROLL_ANIMATION_MS, Math.min(MAX_SCROLL_ANIMATION_MS, durationMs));",
      );
      // Every long jump goes through the distance-aware duration; anchor/deep-link/Ctrl share one call site.
      expect(t, id).toContain(
        "int target = this.lineStarts.get(line) * LINE_HEIGHT;\n\t\tthis.scrollTo(target, true, this.scrollDurationFor(target));",
      );
      expect(t, id).toContain("this.scrollTo(0, true, this.scrollDurationFor(0));");
      expect(t, id).toContain("this.scrollTo(maxScroll, true, this.scrollDurationFor(maxScroll));");
      // Wheel and page steps stay at the base duration so holding the key does not feel laggy.
      expect(t, id).toMatch(
        /this\.scrollTo\(this\.scrollTarget - \(int\) \((?:scrollY|delta) \* SCROLL_STEP\), true\);/,
      );
      expect(t, id).toContain("this.scrollTo(this.scrollTarget - this.pageStep(), true);");
      expect(t, id).toContain("this.scrollTo(this.scrollTarget + this.pageStep(), true);");
      // The duration is only adopted when an animation actually starts.
      const animate = t.indexOf("private void scrollTo(int target, boolean animate, int durationMs) {");
      const duration = t.indexOf("this.scrollDurationMs = Math.max", animate);
      const started = t.indexOf("this.scrollStartedAt = Util.getMillis();", animate);
      expect(animate, id).toBeGreaterThan(-1);
      expect(duration, id).toBeGreaterThan(animate);
      expect(started, id).toBeGreaterThan(duration);
    }
  });

  it("makes section ticks clickable with a titled hover target", () => {
    // UI 23.0: ticks answered "where are the sections" but the only ways to reach one were Ctrl paging
    // or dragging. Hovering a tick now highlights it and names the section; clicking jumps there with
    // the same flash and distance-aware duration as anchors, without starting a scrollbar drag.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private final List<Integer> headingLines = new ArrayList<>();");
      expect(t, id).toContain("private final List<Component> headingTooltips = new ArrayList<>();");
      expect(t, id).toContain("this.headingLines.clear();");
      expect(t, id).toContain("this.headingTooltips.clear();");
      expect(t, id).toContain("this.headingLines.add(line);");
      expect(t, id).toContain("this.headingTooltips.add(Component.translatable(LINE_KEYS[line]));");
      // Hover is recomputed per frame and cleared during the close transition.
      expect(t, id).toContain("this.hoveredHeading = this.closingAt < 0L ? this.headingAt(mouseX, mouseY) : -1;");
      // Hovered ticks are full accent and wider than the current-section tick.
      expect(t, id).toContain("boolean hovered = i == this.hoveredHeading;");
      expect(t, id).toContain("int tickWidth = hovered ? 7 : current ? 5 : 3;");
      expect(t, id).toContain("guiGraphics.fill(x - tickWidth, tickTop, x, tickTop + 1, hovered || current ? ACCENT_COLOR :");
      // The tooltip chain names the hovered section, and the title tooltip yields to it.
      expect(t, id).toContain("} else if (this.hoveredHeading >= 0) {");
      expect(t, id).toContain("guiGraphics.renderTooltip(this.font, this.headingTooltips.get(this.hoveredHeading), mouseX, mouseY);");
      expect(t, id).toContain("if (this.hoveredLink < 0 && this.focusedLink < 0 && this.hoveredHeading < 0 && this.hoveredSearchMark < 0 && this.titleTruncated");
      // The tick hit box is the gutter left of the track, with vertical slack.
      expect(t, id).toContain("private int headingAt(double mouseX, double mouseY)");
      expect(t, id).toContain("if (mouseX < x - 7 || mouseX > x) {");
      expect(t, id).toContain("if (mouseY >= tickTop - 2 && mouseY <= tickTop + 2) {");
      // A tick click wins over the scrollbar drag and lands through scrollToLine (flash + adaptive duration).
      const click = t.indexOf("public boolean mouseClicked");
      const heading = t.indexOf("int heading = this.headingAt(mouseX, mouseY);", click);
      const scrollbar = t.indexOf("this.scrollbarContains(mouseX, mouseY)", click);
      expect(heading, id).toBeGreaterThan(click);
      expect(scrollbar, id).toBeGreaterThan(heading);
      expect(t.slice(heading, scrollbar), id).toContain("this.scrollToLine(this.headingLines.get(heading));");
      // Ticks and their hit box only exist when the page actually scrolls.
      expect(t, id).toContain("if (this.maxScroll() <= 0) {\n\t\t\treturn -1;\n\t\t}");
    }
  });

  it("keeps a line of context on page turns and glides on track clicks", () => {
    // UI 24.0: a full-viewport page step left no overlap, so the first line of the new page was the
    // unseen line after the last one; pageStep() now overlaps by one row. A track click also used to
    // teleport: it now glides with the distance-aware duration, while dragging the thumb (and a
    // thumb press) still follows the pointer directly.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain(
        "private int pageStep() {\n\t\treturn Math.max(LINE_HEIGHT, this.viewportHeight() - LINE_HEIGHT);\n\t}",
      );
      expect(t, id).toContain("this.scrollTo(this.scrollTarget - this.pageStep(), true);");
      expect(t, id).toContain("this.scrollTo(this.scrollTarget + this.pageStep(), true);");
      // The click classifies thumb vs track once, and only a track click animates.
      expect(t, id).toContain("boolean onThumb = mouseY >= thumbTop && mouseY < thumbTop + thumbHeight;");
      const click = t.indexOf("boolean onThumb = mouseY >= thumbTop");
      const thumb = t.indexOf("this.scrollToMouse(mouseY);", click);
      const track = t.indexOf("int target = this.scrollbarScrollAt(mouseY, this.scrollbarGrabOffset);", click);
      const glide = t.indexOf("this.scrollTo(target, true, this.scrollDurationFor(target));", click);
      expect(thumb, id).toBeGreaterThan(click);
      expect(track, id).toBeGreaterThan(thumb);
      expect(glide, id).toBeGreaterThan(track);
      // Target math is shared by the instant drag path and the animated track path.
      expect(t, id).toContain("private int scrollbarScrollAt(double mouseY, int grabOffset) {");
      expect(t, id).toContain("double grab = grabOffset >= 0 ? grabOffset : thumbHeight / 2.0D;");
      expect(t, id).toContain("return (int) Math.round(ratio * maxScroll);");
      expect(t, id).toContain(
        "private void scrollToMouse(double mouseY) {\n\t\tthis.scrollTo(this.scrollbarScrollAt(mouseY, this.scrollbarGrabOffset), false);\n\t}",
      );
      expect(t, id).not.toContain("this.scrollTo((int) Math.round(ratio * maxScroll), false);");
    }
  });

  it("lets the open screen handle its own key and opens only when no screen is up", () => {
    // UI 27.0: KeyboardHandler returns before KeyMapping.set/click whenever Minecraft.screen is
    // non-null (verified in Forge 1.20.1 bytecode), so UI 25.0's tick-side toggle was unreachable.
    // The screen now matches its own spec key in keyPressed and closes through the normal fade;
    // the tick opener only constructs a screen when none is displayed.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int TOGGLE_KEY = {{SCREEN_KEY_CODE}};");
      expect(t, id).toContain("if (TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY) {");
      // The toggle wins over every other key, including the pending-link reset.
      const kp = t.indexOf("public boolean keyPressed");
      expect(t.indexOf("if (TOGGLE_KEY >= 0", kp), id).toBeGreaterThan(kp);
      expect(t.indexOf("if (TOGGLE_KEY >= 0", kp), id).toBeLessThan(t.indexOf("this.pressedLink = -1;", kp));
      expect(t, id).not.toContain("isActive");
      expect(t, id).not.toContain("{{SCREEN_CLASS}} active;");
      expect(t, id).not.toContain("if (active == this)");
      const open = byId.get(id)!.templates.screenOpenStatement;
      expect(open, id).toContain("if ({{KEYBIND_CONST}}.consumeClick() && client.screen == null) {");
      expect(open, id).toContain("client.setScreen(new {{SCREEN_CLASS}}());");
      expect(open, id).not.toContain("isActive");
    }
    const client = plan.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
    expect(client).toContain("if (KEY_GUIDE.consumeClick() && client.screen == null) {");
    expect(client).toContain("client.setScreen(new ModMainGuideScreen());");
    expect(client).not.toContain("isActive");
    // exampleSpec binds the guide to K: the same key reaches the screen's own handler.
    const guide = plan.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(guide).toContain("private static final int TOGGLE_KEY = org.lwjgl.glfw.GLFW.GLFW_KEY_K;");
    expect(guide).toContain("if (TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY) {");
    expect(guide).not.toContain("{{");
  });

  it("arms a pressed link and wires the high-contrast palette through the engine", () => {
    // UI 26.0: links commit on release, so a held button needs visible feedback. While the pointer
    // is on the pressed row, the wash deepens and the underline thickens; dragging off drops the
    // armed look just like it cancels the click. The "contrast" palette lives in the engine, so
    // templates only receive colours.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int LINK_PRESSED_COLOR = {{LINK_PRESSED_COLOR}};");
      expect(t, id).toContain("boolean pressed = hovered && link == this.pressedLink;");
      expect(t, id).toContain(
        "x + this.rowWidths.get(i) + 2, y + LINE_HEIGHT - 1, pressed ? LINK_PRESSED_COLOR : LINK_HOVER_COLOR);",
      );
      expect(t, id).toContain(
        "guiGraphics.fill(x, y + LINE_HEIGHT - (pressed ? 2 : 1), x + this.rowWidths.get(i), y + LINE_HEIGHT, ACCENT_COLOR);",
      );
      // The press flag must not be read in the scissored body before hover is known for the frame.
      expect(t.indexOf("boolean pressed") > t.indexOf("boolean hovered"), id).toBe(true);
    }

    const contrastSpec = structuredClone(spec);
    contrastSpec.ui = { screens: [{ id: "guide", theme: "contrast", lines: ["Read me"] }] };
    const parsedContrast = parseModSpec(contrastSpec);
    expect(parsedContrast.ok, parsedContrast.ok ? "" : parsedContrast.formatted).toBe(true);
    if (!parsedContrast.ok) return;
    const contrastFiles = planProject(parsedContrast.spec, requireAdapter("1.21.1", "fabric")).files;
    const contrast = contrastFiles.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(contrast).toContain("private static final int PANEL_COLOR = 0xFF08090B;");
    expect(contrast).toContain("private static final int ACCENT_COLOR = 0xFFFFD400;");
    expect(contrast).toContain("private static final int NOTE_COLOR = 0xFFC9CED6;");
    expect(contrast).toContain("private static final int WARN_COLOR = 0xFFFF9100;");
    expect(contrast).toContain("private static final int LINK_PRESSED_COLOR = 0x66FFD400;");
    expect(contrast).not.toContain("{{");
  });

  it("renders heading and bullet line styles in every screen template", () => {
    // UI 3.0: line styles are spec data, so the style codes travel through the engine and each
    // template only owns the pixels (accent heading rule, bullet square, accent heading colour).
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int[] LINE_STYLES = {{LINE_STYLES_JAVA}};");
      expect(t, id).toContain("private final List<Integer> rowStyles = new ArrayList<>();");
      expect(t, id).toContain("private final List<Integer> rowIndents = new ArrayList<>();");
      expect(t, id).toContain("private final List<Boolean> rowStarts = new ArrayList<>();");
      expect(t, id).toContain("int indent = style == 2 || style == 3 || style == 4 || style == 5 ? 8 : 0;");
      expect(t, id).toContain("this.font.split(Component.translatable(LINE_KEYS[line]), textWidth - indent)");
      expect(t, id).toContain("if (this.rowStarts.get(i) && style != 0) {");
      expect(t, id).toContain("guiGraphics.fill(x - 6, y, x - 4, y + 9, ACCENT_COLOR);");
      expect(t, id).toContain("guiGraphics.fill(x - 5, y + 4, x - 3, y + 6, ACCENT_COLOR);");
      expect(t, id).toContain("this.rowColor(style, link)");
      // UI 3.1: a blank cached row separates a heading from the section above, and drawing skips it.
      expect(t, id).toContain("int previousStyle = -1;");
      expect(t, id).toContain("if (style == 1 && previousStyle != 1 && previousStyle != -1) {");
      expect(t, id).toContain("this.rows.add(FormattedCharSequence.EMPTY);");
      expect(t, id).toContain("this.rowStyles.add(0);");
      expect(t, id).toContain("previousStyle = style;");
      expect(t, id).toContain("if (this.rowWidths.get(i) == 0) {");
      expect(t, id).toContain("continue;");
    }

    const styledSpec = structuredClone(spec);
    styledSpec.ui = {
      screens: [
        {
          id: "guide",
          lines: ["Plain intro", { text: "Getting started", style: "heading" }, { text: "Mine ruby ore", style: "bullet" }],
        },
      ],
    };
    const parsed = parseModSpec(styledSpec);
    expect(parsed.ok, parsed.ok ? "" : parsed.formatted).toBe(true);
    if (!parsed.ok) return;
    const screen = planProject(parsed.spec, requireAdapter("1.21.1", "fabric")).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(screen).toContain("private static final int[] LINE_STYLES = { 0, 1, 2 };");
    expect(screen).not.toContain("{{");
  });

  it("makes linked lines clickable in every screen template", () => {
    // UI 4.0: a line may target another screen. Hit testing must use the cached row list (so wrapped
    // and blank heading rows keep indices aligned), the link colour and underline are template
    // pixels, and the generated switch owns which screen opens.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int[] LINE_LINKS = {{LINE_LINKS_JAVA}};");
      expect(t, id).toContain("private static final String[] LINE_TARGET_KEYS = {{LINE_TARGET_KEYS_JAVA}};");
      expect(t, id).toContain("private static final String[] LINE_SECTION_KEYS = {{LINE_SECTION_KEYS_JAVA}};");
      expect(t, id).toContain("private static final int LINK_HOVER_COLOR = {{LINK_HOVER_COLOR}};");
      expect(t, id).toContain("private final List<Integer> rowLinks = new ArrayList<>();");
      expect(t, id).toContain("private final List<Component> lineTooltips = new ArrayList<>();");
      expect(t, id).toContain("private boolean hasLinks;");
      expect(t, id).toContain("private int hoveredLink = -1;");
      expect(t, id).toContain("this.rowLinks.clear();");
      expect(t, id).toContain("this.lineTooltips.clear();");
      expect(t, id).toContain("this.hasLinks = false;");
      expect(t, id).toContain("this.hoveredLink = -1;");
      // A blank heading row must occupy a link slot too, or every later link points at the wrong row.
      expect(t, id).toContain("this.rowLinks.add(-1);");
      expect(t, id).toContain("this.rowLinks.add(LINE_LINKS[line]);");
      // UI 5.1: tooltips are cached per logical line in init; hovering must not allocate, and a
      // screen without links skips hit testing entirely.
      expect(t, id).toContain("this.hasLinks = true;");
      expect(t, id).toContain("if (target < 0 || LINE_TARGET_KEYS[line].isEmpty()) {");
      expect(t, id).toContain("} else if (LINE_SECTION_KEYS[line].isEmpty()) {");
      expect(t, id).toContain("this.lineTooltips.add(Component.translatable(LINE_TARGET_KEYS[line]));");
      // UI 32.0: a deep-link tooltip composes "<screen> › <section>" from cached keys.
      expect(t, id).toContain(
        'this.lineTooltips.add(Component.translatable(LINE_TARGET_KEYS[line]).append(" › ").append(Component.translatable(LINE_SECTION_KEYS[line])));',
      );
      expect(t, id).toContain("this.hoveredLink = this.closingAt < 0L && this.hasLinks && !(this.searchBox != null && this.searchBarContains(mouseX, mouseY)) ? this.linkAt(mouseX, mouseY) : -1;");
      expect(t, id).not.toContain("Component.translatable(LINE_TARGET_KEYS[this.hoveredLink])");
      expect(t, id).toContain("int link = this.rowLinks.get(i);");
      expect(t, id).toContain("this.rowColor(style, link)");
      expect(t, id).toContain("boolean hovered = link >= 0 && link == this.hoveredLink;");
      expect(t, id).toContain("boolean pressed = hovered && link == this.pressedLink;");
      expect(t, id).toContain(
        "guiGraphics.fill(x - 2, y - 1, x + this.rowWidths.get(i) + 2, y + LINE_HEIGHT - 1, pressed ? LINK_PRESSED_COLOR : LINK_HOVER_COLOR);",
      );
      expect(t, id).toContain("if (hovered) {");
      expect(t, id).toContain(
        "guiGraphics.fill(x, y + LINE_HEIGHT - (pressed ? 2 : 1), x + this.rowWidths.get(i), y + LINE_HEIGHT, ACCENT_COLOR);",
      );
      expect(t, id).toContain("Component tooltip = this.lineTooltips.get(this.hoveredLink);");
      expect(t, id).toContain("guiGraphics.renderTooltip(this.font, tooltip, mouseX, mouseY);");
      // UI 4.1: hit testing shares the slide offset and hover is refreshed in render, so the
      // underline follows smooth scrolling and clicks land on what the player sees.
      expect(t, id).toContain("private int currentSlide()");
      expect(t, id).toContain("int slide = this.currentSlide() + this.currentCloseSlide();");
      expect(t, id).toContain("int top = (this.height - this.panelHeight) / 2 + BODY_TOP + this.currentSlide();");
      expect(t, id).toContain("int y = (this.height - this.panelHeight) / 2 + BODY_TOP + this.currentSlide();");
      expect(t, id).toContain("int bodyTop = (this.height - this.panelHeight) / 2 + BODY_TOP + this.currentSlide();");
      expect(t, id).not.toContain("public void mouseMoved(double mouseX, double mouseY)");
      expect(t, id).toContain("private int linkAt(double mouseX, double mouseY)");
      expect(t, id).toContain("int link = this.rowLinks.get(row);");
      expect(t, id).toContain("private void openLineLink(int line)");
      // UI 19.0: the press only records the row; release over the same row opens it.
      expect(t, id).toContain("this.pressedLink = line;");
      expect(t, id).toContain("this.openLineLink(pressed);");
      // UI 6.0: a self link is generated as scrollTo(0, true), so every template must own the
      // smooth-scroll helper with this exact signature.
      expect(t, id).toContain("private void scrollTo(int target, boolean animate)");
      // UI 7.0: activating any in-body link gives the same click feedback as a vanilla button.
      expect(t, id).toContain("import net.minecraft.client.resources.sounds.SimpleSoundInstance;");
      expect(t, id).toContain("import net.minecraft.sounds.SoundEvents;");
      expect(t, id).toContain(
        "private void openLineLink(int line) {\n\t\tthis.minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F));",
      );
      // UI 8.0: anchors need the logical-line -> first-row cache and a smooth jump helper.
      expect(t, id).toContain("private final List<Integer> lineStarts = new ArrayList<>();");
      expect(t, id).toContain("this.lineStarts.clear();");
      expect(t, id).toContain("this.lineStarts.add(this.rows.size());");
      expect(t, id).toContain("private void scrollToLine(int line)");
      expect(t, id).toContain("int target = this.lineStarts.get(line) * LINE_HEIGHT;\n\t\tthis.scrollTo(target, true, this.scrollDurationFor(target));");
      // UI 9.0: the jumped-to row flashes for a moment so the landing point is visible.
      expect(t, id).toContain("private static final int FLASH_MS = 600;");
      expect(t, id).toContain("private int flashLine = -1;");
      expect(t, id).toContain("this.flashLine = -1;");
      expect(t, id).toContain(
        "this.flashLine = line;\n\t\tthis.flashStartedAt = Util.getMillis();\n\t\tint target = this.lineStarts.get(line) * LINE_HEIGHT;\n\t\tthis.scrollTo(target, true, this.scrollDurationFor(target));",
      );
      expect(t, id).toContain("private int flashColor(int row)");
      expect(t, id).toContain("int start = this.lineStarts.get(this.flashLine);");
      expect(t, id).toContain(
        "int end = this.flashLine + 1 < this.lineStarts.size() ? this.lineStarts.get(this.flashLine + 1) : this.rows.size();",
      );
      expect(t, id).toContain("int flash = this.flashColor(i);");
      expect(t, id).toContain("guiGraphics.fill(x - 2, y - 1, x + this.rowWidths.get(i) + 2, y + LINE_HEIGHT - 1, flash);");
      // UI 10.0: in-body links are reachable from the keyboard, without stealing Tab from the footer.
      expect(t, id).toContain("private int focusedLink = -1;");
      expect(t, id).toContain("boolean focused = link >= 0 && link == this.focusedLink;");
      expect(t, id).toContain("private void focusLink(int direction)");
      expect(t, id).toContain("this.setFocused(null);");
      expect(t, id).toContain("private void ensureLineVisible(int line)");
      // UI 30.0: keyboard focus keeps one row of context at either edge, and a link taller than
      // the viewport keeps its first row instead of being pushed under the top edge.
      expect(t, id).toContain("int margin = LINE_HEIGHT;");
      expect(t, id).toContain("this.scrollTo(Math.max(0, start - margin), true);");
      expect(t, id).toContain("int target = Math.min(start, end + margin - this.viewportHeight());");
      expect(t, id).toContain("this.scrollTo(Math.max(0, target), true);");
      expect(t, id).toContain("keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER");
      expect(t, id).toContain("this.getFocused() == null");
      expect(t, id).toContain("this.focusedLink = line;");
      expect(t, id).toContain("guiGraphics.fill(x - 3, y - 1, x - 1, y + LINE_HEIGHT, ACCENT_COLOR);");
      // UI 10.1 / 19.0: a mouse press leaves keyboard link navigation and drops a stale press; a
      // completed click re-focuses its own row when it opens.
      expect(t, id).toContain(
        "public boolean mouseClicked(double mouseX, double mouseY, int button) {\n\t\tif (this.closingAt >= 0L) {\n\t\t\treturn true;\n\t\t}\n\t\t// Any mouse press leaves keyboard link navigation; a completed link click re-focuses its row.\n\t\tthis.focusedLink = -1;\n\t\tthis.pressedLink = -1;",
      );
      // UI 11.0: a cross-screen deep link passes a logical line through the constructor and init()
      // consumes it once, after lineStarts exists - resizing or returning must not jump again.
      expect(t, id).toContain("private int initialLine = -1;");
      expect(t, id).toContain("this(parent, -1);");
      expect(t, id).toContain("public {{SCREEN_CLASS}}(Screen parent, int initialLine)");
      expect(t, id).toContain("this.initialLine = initialLine;");
      expect(t, id).toContain("if (this.initialLine >= 0) {");
      expect(t, id).toContain("this.scrollToLine(line);");
      // UI 12.0: keyboard focus has no pointer, so show the same cached destination tooltip
      // under the focused logical row instead of at the mouse.
      expect(t, id).toContain("} else if (this.focusedLink >= 0) {");
      expect(t, id).toContain("int row = this.lineStarts.get(this.focusedLink);");
      expect(t, id).toContain("guiGraphics.renderTooltip(this.font, tooltip, x, y);");
      // UI 12.0: scrollable bodies fade their top/bottom edge with the theme's panel colour,
      // so overflow is visible even when the scrollbar is not hovered.
      expect(t, id).toContain("private static final int EDGE_FADE_HEIGHT = 4;");
      expect(t, id).toContain("int fadeHeight = Math.min(EDGE_FADE_HEIGHT, viewport / 2);");
      expect(t, id).toContain("if (scroll > 0) {");
      expect(t, id).toContain("if (scroll < maxScroll) {");
      expect(t, id).toContain("(PANEL_COLOR & 0x00FFFFFF) | (alpha << 24)");
    }

    const linkedSpec = structuredClone(spec);
    linkedSpec.ui = {
      screens: [
        { id: "guide", lines: ["Plain intro", { text: "Open settings", target: "settings" }] },
        { id: "settings", lines: ["s"] },
      ],
    };
    const parsed = parseModSpec(linkedSpec);
    expect(parsed.ok, parsed.ok ? "" : parsed.formatted).toBe(true);
    if (!parsed.ok) return;
    const generated = planProject(parsed.spec, requireAdapter("1.21.1", "fabric")).files;
    const guide = generated.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(guide).toContain("private static final int[] LINE_LINKS = { -1, 1 };");
    expect(guide).toContain('private static final String[] LINE_TARGET_KEYS = { "", "examplemod.screen.settings.title" };');
    expect(guide).toContain("private static final int LINK_HOVER_COLOR = 0x33FFAA00;");
    expect(guide).toContain("case 1: this.minecraft.setScreen(new ModMainSettingsScreen(this)); break;");
    expect(guide).not.toContain("{{");
    const settings = generated.find((f) => f.path.endsWith("ModMainSettingsScreen.java"))!.content;
    expect(settings).toContain("private static final int[] LINE_LINKS = { -1 };");
    expect(settings).toContain('private static final String[] LINE_TARGET_KEYS = { "" };');
    expect(settings).toContain("// This screen has no in-body links.");

    const selfSpec = structuredClone(spec);
    selfSpec.ui = {
      screens: [{ id: "guide", lines: ["Plain intro", { text: "Back to top", target: "guide" }] }],
    };
    const parsedSelf = parseModSpec(selfSpec);
    expect(parsedSelf.ok, parsedSelf.ok ? "" : parsedSelf.formatted).toBe(true);
    if (!parsedSelf.ok) return;
    const selfGenerated = planProject(parsedSelf.spec, requireAdapter("1.21.1", "fabric")).files;
    const selfScreen = selfGenerated.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(selfScreen).toContain("private static final int[] LINE_LINKS = { -1, 1 };");
    expect(selfScreen).toContain('private static final String[] LINE_TARGET_KEYS = { "", "" };');
    expect(selfScreen).toContain("case 1: this.scrollTo(0, true, this.scrollDurationFor(0)); break;");
    expect(selfScreen).not.toContain("new ModMainGuideScreen(this)");
    expect(selfScreen).not.toContain("{{");

    const anchorSpec = structuredClone(spec);
    anchorSpec.ui = {
      screens: [
        {
          id: "guide",
          lines: [{ text: "Intro", style: "heading", anchor: "intro" }, "Body", { text: "Jump", target: "#intro" }],
        },
      ],
    };
    const parsedAnchor = parseModSpec(anchorSpec);
    expect(parsedAnchor.ok, parsedAnchor.ok ? "" : parsedAnchor.formatted).toBe(true);
    if (!parsedAnchor.ok) return;
    const anchorScreen = planProject(parsedAnchor.spec, requireAdapter("1.21.1", "fabric")).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(anchorScreen).toContain("case 2: this.scrollToLine(0); break;");
    expect(anchorScreen).toContain('private static final String[] LINE_TARGET_KEYS = { "", "", "" };');
    expect(anchorScreen).not.toContain("{{");

    const deepSpec = structuredClone(spec);
    deepSpec.ui = {
      screens: [
        { id: "guide", lines: ["Plain intro", { text: "Open advanced", target: "settings#advanced" }] },
        {
          id: "settings",
          lines: ["Intro", "More", { text: "Advanced", style: "heading", anchor: "advanced" }, "Body"],
        },
      ],
    };
    const parsedDeep = parseModSpec(deepSpec);
    expect(parsedDeep.ok, parsedDeep.ok ? "" : parsedDeep.formatted).toBe(true);
    if (!parsedDeep.ok) return;
    const deepFiles = planProject(parsedDeep.spec, requireAdapter("1.21.1", "fabric")).files;
    const deepGuide = deepFiles.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(deepGuide).toContain("case 1: this.minecraft.setScreen(new ModMainSettingsScreen(this, 2)); break;");
    expect(deepGuide).toContain('private static final String[] LINE_TARGET_KEYS = { "", "examplemod.screen.settings.title" };');
    expect(deepGuide).toContain('private static final String[] LINE_SECTION_KEYS = { "", "examplemod.screen.settings.line.3" };');
    expect(deepGuide).not.toContain("{{");
    const deepSettings = deepFiles.find((f) => f.path.endsWith("ModMainSettingsScreen.java"))!.content;
    expect(deepSettings).toContain("this.initialLine = initialLine;");
    expect(deepSettings).toContain("this.scrollToLine(line);");
    expect(deepSettings).not.toContain("{{");
  });

  it("fades styled screens out before closing and locks input meanwhile", () => {
    // UI 13.0: ESC and the close button now fade the panel away before switching to the parent, so
    // leaving a screen is not an abrupt cut. Slide themes also drift down; "none" keeps the old
    // instant close. Every input handler must swallow events during the 120ms transition so a
    // second click cannot open a screen that the pending setScreen would immediately replace.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int CLOSE_ANIMATION_MS = 120;");
      expect(t, id).toContain("private long closingAt = -1L;");
      expect(t, id).toContain("private boolean closeSwitched;");
      expect(t, id).toContain("private int currentCloseSlide()");
      expect(t, id).toContain("private float closeProgress()");
      expect(t, id).toContain("int slide = this.currentSlide() + this.currentCloseSlide();");
      expect(t, id).toContain("this.hoveredLink = this.closingAt < 0L && this.hasLinks && !(this.searchBox != null && this.searchBarContains(mouseX, mouseY)) ? this.linkAt(mouseX, mouseY) : -1;");
      expect(t, id).toContain("if (close >= 1.0F && !this.closeSwitched) {");
      expect(t, id).toContain("this.closeSwitched = true;");
      expect(t, id).toContain("guiGraphics.fill(0, 0, this.width, this.height, ((int) (close * 255.0F)) << 24);");
      expect(t, id).toContain("if (this.closingAt >= 0L) {\n\t\t\treturn;\n\t\t}\n\t\tif (ANIMATION_STYLE == 0) {");
      expect(t, id).toContain("this.focusedLink = -1;\n\t\tthis.closingAt = Util.getMillis();");
      // render's fade block + onClose + the five input handlers.
      expect((t.match(/if \(this\.closingAt >= 0L\) \{/g) ?? []).length, id).toBe(7);
      expect(t, id).toContain("private int currentCloseSlide() {\n\t\tif (ANIMATION_STYLE != 2 || this.closingAt < 0L) {");
    }
  });

  it("lifts the panel, separates the footer and reveals a truncated title", () => {
    // UI 14.0: two translucent bands give the panel depth over the dimmed world, a divider above
    // the footer (only when buttons exist) makes the action area readable, and a title that had to
    // be ellipsized shows its full text when the pointer rests on the title band. Hit testing must
    // include the entrance/close slide so the tooltip appears under the title the player sees.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private boolean titleTruncated;");
      expect(t, id).toContain("this.titleTruncated = this.font.width(full) > maxWidth;");
      expect(t, id).toContain("guiGraphics.fill(left - 3, top - 3, left + this.panelWidth + 3, top + this.panelHeight + 3, 0x18000000);");
      expect(t, id).toContain("guiGraphics.fill(left - 1, top - 1, left + this.panelWidth + 1, top + this.panelHeight + 1, 0x30000000);");
      expect(t, id).toContain("if (FOOTER_HEIGHT > 12) {");
      expect(t, id).toContain(
        "guiGraphics.fill(left + BODY_SIDE, top + this.panelHeight - FOOTER_HEIGHT + 2, left + this.panelWidth - BODY_SIDE, top + this.panelHeight - FOOTER_HEIGHT + 3, BORDER_COLOR);",
      );
      expect(t, id).toContain("private boolean titleContains(double mouseX, double mouseY)");
      expect(t, id).toContain("int slide = this.currentSlide() + this.currentCloseSlide();");
      expect(t, id).toContain(
        "this.hoveredLink < 0 && this.focusedLink < 0 && this.hoveredHeading < 0 && this.hoveredSearchMark < 0 && this.titleTruncated && this.closingAt < 0L && this.titleContains(mouseX, mouseY)",
      );
      expect(t, id).toContain("guiGraphics.renderTooltip(this.font, this.title, mouseX, mouseY);");
    }
  });

  it("renders note lines as quoted secondary text in every screen template", () => {
    // UI 15.0: style code 3 is a note - indented like a bullet, painted in the theme's muted note
    // colour and backed by a quote rule on every wrapped row. A linked note keeps the accent colour
    // so clickability still wins over the muted role, which is why colour selection moved into a
    // helper instead of another nested ternary in the draw loop.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int NOTE_COLOR = {{NOTE_COLOR}};");
      expect(t, id).toContain("private int rowColor(int style, int link) {");
      expect(t, id).toContain("if (link >= 0 || style == 1) {");
      expect(t, id).toContain("return style == 3 ? NOTE_COLOR : style == 4 ? WARN_COLOR : BODY_COLOR;");
      expect(t, id).toContain("int indent = style == 2 || style == 3 || style == 4 || style == 5 ? 8 : 0;");
      expect(t, id).toContain("} else if (style == 2) {");
      expect(t, id).toContain("if (style == 3) {");
      expect(t, id).toContain("guiGraphics.fill(x - 6, y, x - 5, y + LINE_HEIGHT, NOTE_COLOR);");
    }
  });

  it("renders warn lines with the warm warn colour and a thicker rule in every screen template", () => {
    // UI 33.0: style code 4 is a warning. It shares the note's indent and rule geometry, but gets
    // its own per-theme warm colour and a 2px rule so a caution cannot be mistaken for a note.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int WARN_COLOR = {{WARN_COLOR}};");
      expect(t, id).toContain("if (style == 4) {");
      expect(t, id).toContain("guiGraphics.fill(x - 6, y, x - 4, y + LINE_HEIGHT, WARN_COLOR);");
    }
  });

  it("numbers step lines in every screen template", () => {
    // UI 34.0: style code 5 is a step. The engine owns the ordinal (STEP_TEXT), the template only
    // right-aligns the label in the marker gutter and keeps one row-level parallel list so wrapped
    // continuation rows do not repeat the number.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final String[] STEP_TEXT = {{STEP_TEXT_JAVA}};");
      expect(t, id).toContain("private final List<String> rowStepTexts = new ArrayList<>();");
      expect(t, id).toContain("this.rowStepTexts.clear();");
      expect(t, id).toContain('this.rowStepTexts.add("");');
      expect(t, id).toContain('this.rowStepTexts.add(first ? STEP_TEXT[line] : "");');
      expect(t, id).toContain("} else if (style == 5) {");
      expect(t, id).toContain("String step = this.rowStepTexts.get(i);");
      expect(t, id).toContain("guiGraphics.drawString(this.font, step, Math.max(left + 1, x - 3 - this.font.width(step)), y, ACCENT_COLOR, false);");
    }
  });

  it("finds text inside a screen in every screen template", () => {
    // UI 35.0: Ctrl+F opens a find bar. The engine owns only the placeholder key; the template owns
    // the interaction: find-as-you-type over the rendered line texts (case-insensitive via
    // Locale.ROOT), Enter cycles the hits with the anchor flash, ESC closes the bar before the
    // screen does, and the bar's keys never leak into the scroll/link handlers while it has focus.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain('private static final String SEARCH_LANG_KEY = "{{SCREEN_SEARCH_KEY}}";');
      expect(t, id).toContain("import net.minecraft.client.gui.components.EditBox;");
      expect(t, id).toContain("import java.util.Locale;");
      expect(t, id).toContain("private EditBox searchBox;");
      expect(t, id).toContain("private void ensureSearchTexts() {");
      expect(t, id).toContain("this.searchTexts.add(Component.translatable(key).getString().toLowerCase(Locale.ROOT));");
      expect(t, id).toContain("new EditBox(this.font, left + BODY_SIDE, top + BODY_TOP - 6, boxWidth, 20, Component.translatable(SEARCH_LANG_KEY))");
      expect(t, id).toContain("this.searchBox.setHint(Component.translatable(SEARCH_LANG_KEY));");
      expect(t, id).toContain("this.searchBox.setResponder(this::refreshSearch);");
      expect(t, id).toContain("this.setFocused(this.searchBox);");
      expect(t, id).toContain("this.removeWidget(this.searchBox);");
      // Find-as-you-type: every responder call rescans the lowered texts and jumps to the first hit.
      expect(t, id).toContain("String needle = query.trim().toLowerCase(Locale.ROOT);");
      expect(t, id).toContain("if (this.searchTexts.get(line).contains(needle)) {");
      // UI 38.0 moved the initial landing from a flat first hit to the first hit from the reader's row.
      expect(t, id).toContain("this.scrollToLine(this.searchMatches.get(this.searchIndex));");
      // Enter cycles with wraparound, so the last hit loops back to the first.
      expect(t, id).toContain("this.searchIndex = (this.searchIndex + 1) % this.searchMatches.size();");
      expect(t, id).toContain("this.scrollToLine(this.searchMatches.get(this.searchIndex));");
      // The counter and the opaque strip are drawn with the body, under the scrollbar map.
      expect(t, id).toContain('String count = (this.searchIndex + 1) + "/" + this.searchMatches.size();');
      expect(t, id).toContain("guiGraphics.fill(left + 3, barTop, left + this.panelWidth - 3, barBottom, (PANEL_COLOR & 0x00FFFFFF) | 0xFF000000);");
      expect(t, id).toContain("this.searchMatches.isEmpty() ? NOTE_COLOR : ACCENT_COLOR, false);");
      const scissor = t.indexOf("guiGraphics.disableScissor();");
      const strip = t.indexOf("if (this.searchBox != null) {", scissor);
      const thumb = t.indexOf("guiGraphics.fill(x, thumbTop, x + trackWidth, thumbTop + thumbHeight, ACCENT_COLOR);", scissor);
      expect(strip, id).toBeGreaterThan(scissor);
      expect(thumb, id).toBeGreaterThan(strip);
      // Keys: Ctrl+F first, then ESC closes the bar, then the focused bar owns everything else.
      const key = t.indexOf("public boolean keyPressed(int keyCode, int scanCode, int modifiers) {");
      const ctrl = t.indexOf("if (Screen.hasControlDown() && keyCode == GLFW.GLFW_KEY_F) {", key);
      const esc = t.indexOf("if (this.searchBox != null && keyCode == GLFW.GLFW_KEY_ESCAPE) {", key);
      const owns = t.indexOf("if (this.searchBox != null && this.getFocused() == this.searchBox) {", key);
      const enter = t.indexOf("this.nextSearchMatch();", key);
      const toggle = t.indexOf("if (TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY) {", key);
      expect(ctrl, id).toBeGreaterThan(key);
      expect(esc, id).toBeGreaterThan(ctrl);
      expect(owns, id).toBeGreaterThan(esc);
      expect(enter, id).toBeGreaterThan(owns);
      // Behind the search guard: typing the toggle key into the box must not close the screen.
      expect(toggle, id).toBeGreaterThan(owns);
      expect(t.slice(owns, toggle), id).toContain("return super.keyPressed(keyCode, scanCode, modifiers);");
      // The bar covers the first rows, so clicks in its strip bypass link/scrollbar hit-testing.
      expect(t, id).toContain("if (this.searchBox != null && this.searchBarContains(mouseX, mouseY)) {");
      expect(t, id).toContain("return mouseX >= left && mouseX <= left + this.panelWidth - 6 && mouseY >= top && mouseY <= top + 25;");
      // A resize drops the bar along with the layout it was pointing at.
      expect(t, id).toContain("this.searchBox = null;\n\t\tthis.searchIndex = -1;\n\t\tthis.searchMatches.clear();\n\t\tthis.searchTexts.clear();");
    }
  });

  it("highlights search matches in the body in every screen template", () => {
    // UI 36.0: while the find bar is open every matched line is tinted behind its text, and the hit
    // Enter would land on is stronger so the reader can tell the cycle target from the rest.
    // refreshSearch builds a per-visual-row ordinal map (0 none, 1-based match) from lineStarts so
    // the draw loop stays O(1); the tint is painted before the landing flash and the link hover so
    // those still read on top. Closing the bar, rebuilding the screen, or typing a new query drops
    // the stale map.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private int[] searchHits;");
      expect(t, id).toContain("this.searchHits = new int[this.rows.size()];");
      expect(t, id).toContain("int end = line + 1 < this.lineStarts.size() ? this.lineStarts.get(line + 1) : this.rows.size();");
      expect(t, id).toContain("this.searchHits[row] = i + 1;");
      expect(t, id).toContain("if (this.searchHits != null && i < this.searchHits.length && this.searchHits[i] > 0) {");
      expect(t, id).toContain("int alpha = this.searchHits[i] - 1 == this.searchIndex ? 0x40 : 0x1C;");
      expect(t, id).toContain("guiGraphics.fill(x - 2, y - 1, x + this.rowWidths.get(i) + 2, y + LINE_HEIGHT - 1, (ACCENT_COLOR & 0x00FFFFFF) | (alpha << 24));");
      // The tint sits inside the body loop, before the flash block and the hover fill.
      const tint = t.indexOf("this.searchHits[i] > 0", t.indexOf("private void drawBody(GuiGraphics guiGraphics, int left, int top, int slide) {"));
      const flash = t.indexOf("int flash = this.flashColor(i);", tint);
      expect(tint, id).toBeGreaterThan(-1);
      expect(flash, id).toBeGreaterThan(tint);
      // Dropped in exactly three places: closeSearch, init's rebuild drop, and every refresh.
      expect(t.match(/this\.searchHits = null;/g), id).toHaveLength(3);
    }
  });

  it("cycles the find bar both ways and makes its counter clickable in every screen template", () => {
    // UI 37.0: the hits are visible since 36.0; now the cycle is walkable in both directions and
    // the n/m counter itself became a control. Enter keeps advancing, Shift+Enter walks back with
    // the same wraparound, a click on the counter zone advances like Enter, and hovering that zone
    // spells both keys out — its lang key ships with every screen so nothing is hardcoded English.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const a = byId.get(id)!;
      const t = a.templates.screenClass;
      expect(a.langKeys.screenSearchCycle, id).toContain("search_cycle");
      expect(t, id).toContain('private static final String SEARCH_CYCLE_LANG_KEY = "{{SCREEN_SEARCH_CYCLE_KEY}}";');
      expect(t, id).toContain("private boolean hoveredSearchCounter;");
      expect(t, id).toContain("this.hoveredSearchCounter = this.closingAt < 0L && this.searchBox != null && this.searchCounterContains(mouseX, mouseY);");
      // The tooltip chain resolves the counter first: it overlaps the first rows' links.
      const tooltip = t.indexOf("if (this.hoveredSearchCounter) {");
      const hovered = t.indexOf("} else if (this.hoveredLink >= 0) {", tooltip);
      expect(tooltip, id).toBeGreaterThan(-1);
      expect(hovered, id).toBeGreaterThan(tooltip);
      expect(t.slice(tooltip, hovered), id).toContain("Component.translatable(SEARCH_CYCLE_LANG_KEY)");
      // The counter click lives inside the strip's mouse branch, ahead of the text-field delegate.
      const bar = t.indexOf("if (this.searchBox != null && this.searchBarContains(mouseX, mouseY)) {");
      const counterClick = t.indexOf("if (button == 0 && !this.searchMatches.isEmpty() && this.searchCounterContains(mouseX, mouseY)) {", bar);
      const delegate = t.indexOf("return super.mouseClicked(mouseX, mouseY, button);", counterClick);
      expect(counterClick, id).toBeGreaterThan(bar);
      expect(delegate, id).toBeGreaterThan(counterClick);
      // Enter splits on Shift: back-stepping is called in exactly one place.
      const enterBranch = t.indexOf("if (keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER) {");
      const shift = t.indexOf("if (Screen.hasShiftDown()) {", enterBranch);
      const prev = t.indexOf("this.prevSearchMatch();", shift);
      const next = t.indexOf("this.nextSearchMatch();", shift);
      expect(shift, id).toBeGreaterThan(enterBranch);
      expect(prev, id).toBeGreaterThan(shift);
      expect(next, id).toBeGreaterThan(prev);
      expect(t.match(/this\.prevSearchMatch\(\);/g), id).toHaveLength(1);
      expect(t, id).toContain("this.searchIndex = (this.searchIndex + this.searchMatches.size() - 1) % this.searchMatches.size();");
      // The hit test mirrors the drawn counter: same right anchor, same strip height.
      expect(t, id).toContain("int textLeft = left + this.panelWidth - 6 - this.font.width(count);");
      expect(t, id).toContain("return mouseX >= textLeft - 2 && mouseX <= left + this.panelWidth - 3 && mouseY >= top && mouseY <= top + 24;");
    }
  });

  it("remembers the last query across finds and starts at the reader's row in every screen template", () => {
    // UI 38.0: close the bar, reopen it, and the query is still there (static field survives the
    // screen instance; setValue re-runs the responder so the matches rebuild immediately). Typing a
    // query no longer always lands on the document's first hit: the landing is the first hit at or
    // below the reader's current row (lineForScroll of the scroll target), wrapping to the top when
    // everything matched above — the browsers' find-box behavior.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain('private static String lastSearchQuery = "";');
      // Exactly four mentions: field, restore check, setValue argument, refresh store — closeSearch
      // must not touch it, or reopening would always come back blank.
      expect(t.match(/lastSearchQuery/g), id).toHaveLength(4);
      const toggle = t.indexOf("private void toggleSearch() {");
      const responder = t.indexOf("this.searchBox.setResponder(this::refreshSearch);", toggle);
      const restore = t.indexOf("if (!lastSearchQuery.isEmpty()) {", responder);
      const setValue = t.indexOf("this.searchBox.setValue(lastSearchQuery);", restore);
      const added = t.indexOf("this.addRenderableWidget(this.searchBox);", setValue);
      expect(restore, id).toBeGreaterThan(responder);
      expect(setValue, id).toBeGreaterThan(restore);
      expect(added, id).toBeGreaterThan(setValue);
      const refresh = t.indexOf("private void refreshSearch(String query) {");
      const store = t.indexOf("lastSearchQuery = query;", refresh);
      const clear = t.indexOf("this.searchMatches.clear();", refresh);
      expect(store, id).toBeGreaterThan(refresh);
      expect(clear, id).toBeGreaterThan(store);
      const topLine = t.indexOf("int topLine = this.lineForScroll(this.scrollTarget);", refresh);
      const zero = t.indexOf("this.searchIndex = 0;", topLine);
      const scan = t.indexOf("if (this.searchMatches.get(i) >= topLine) {", zero);
      const pick = t.indexOf("this.searchIndex = i;", scan);
      const jump = t.indexOf("this.scrollToLine(this.searchMatches.get(this.searchIndex));", pick);
      expect(topLine, id).toBeGreaterThan(clear);
      expect(zero, id).toBeGreaterThan(topLine);
      expect(scan, id).toBeGreaterThan(zero);
      expect(pick, id).toBeGreaterThan(scan);
      expect(jump, id).toBeGreaterThan(pick);
    }
  });

  it("marks search hits on the scrollbar track in every screen template", () => {
    // UI 39.0/40.0: while a find is active the track doubles as a match map — one dash per matched
    // line on the edge opposite the section ticks (hits extend right of the track, headings left),
    // each positioned like a heading tick (lineStarts row over the row count) at a fixed anchor so
    // a hover-widened track never shifts them; the cycle's target or the hovered mark draws in the
    // full accent at double width. (Hover/click behavior is pinned by the 40.0 test below.)
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("// Hit markers mirror the section ticks on the track's other edge, at a fixed anchor so a hover-widened track never shifts them; the cycle target or the hovered mark is full accent.");
      expect(t, id).toContain("int markLeft = x + 2;");
      expect(t, id).toContain("int markTop = bodyTop + this.lineStarts.get(line) * trackHeight / rowCount;");
      expect(t, id).toContain("boolean target = i == this.searchIndex;");
      expect(t, id).toContain("int markWidth = target || hovered ? 5 : 3;");
      expect(t, id).toContain("guiGraphics.fill(markLeft, markTop, markLeft + markWidth, markTop + 1, target || hovered ? ACCENT_COLOR : ((ACCENT_COLOR & 0x00FFFFFF) | 0x80000000));");
      // Stale line indices from a rebuild are skipped, not clipped.
      expect(t, id).toContain("if (line >= this.lineStarts.size()) {");
      // The marker loop sits between the heading ticks and the thumb, so the map layers bottom-up.
      const ticks = t.indexOf("guiGraphics.fill(x - tickWidth, tickTop, x, tickTop + 1,");
      const marks = t.indexOf("int markLeft = x + 2;", ticks);
      const thumb = t.indexOf("guiGraphics.fill(x, thumbTop, x + trackWidth, thumbTop + thumbHeight, ACCENT_COLOR);", marks);
      expect(marks, id).toBeGreaterThan(ticks);
      expect(thumb, id).toBeGreaterThan(marks);
    }
  });

  it("makes the hit marks hoverable and clickable in every screen template", () => {
    // UI 40.0: the 39.0 map was read-only. A hovered mark now widens and brightens like a hovered
    // section tick and names its matched line through the shared tooltip chain (behind the counter,
    // ahead of links); a click jumps to that hit and makes it the cycle's current one, so Enter
    // walks on from there. Marks drawn over the bar's first rows stay clickable through the strip
    // branch, and the anchor turned fixed (x + 2): widening the track on hover used to shift every
    // dash right and push the 5px target past the panel edge.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private int hoveredSearchMark = -1;");
      // Recomputed per frame like the heading hover, cleared during the close transition.
      expect(t, id).toContain("this.hoveredSearchMark = this.closingAt < 0L ? this.searchMarkAt(mouseX, mouseY) : -1;");
      // The hovered mark joins the target's styling: full accent at double width.
      expect(t, id).toContain("boolean hovered = i == this.hoveredSearchMark;");
      expect(t, id).toContain("int markWidth = target || hovered ? 5 : 3;");
      expect(t, id).toContain("guiGraphics.fill(markLeft, markTop, markLeft + markWidth, markTop + 1, target || hovered ? ACCENT_COLOR : ((ACCENT_COLOR & 0x00FFFFFF) | 0x80000000));");
      // The stale anchor is gone for good: hover no longer shifts the dashes.
      expect(t, id).not.toContain("int markLeft = x + trackWidth;");
      // The tooltip chain resolves the counter, then the hovered mark, then the links.
      const counter = t.indexOf("if (this.hoveredSearchCounter) {");
      const markTip = t.indexOf("} else if (this.hoveredSearchMark >= 0) {", counter);
      const linkTip = t.indexOf("} else if (this.hoveredLink >= 0) {", markTip);
      expect(markTip, id).toBeGreaterThan(counter);
      expect(linkTip, id).toBeGreaterThan(markTip);
      expect(t, id).toContain("guiGraphics.renderTooltip(this.font, Component.translatable(LINE_KEYS[this.searchMatches.get(this.hoveredSearchMark)]), mouseX, mouseY);");
      // The title tooltip yields to a hovered mark as well.
      expect(t, id).toContain("this.hoveredHeading < 0 && this.hoveredSearchMark < 0 && this.titleTruncated");
      // Hit box: same gutter/guards as the ticks, mirrored to the track's other edge.
      const headingAt = t.indexOf("private int headingAt(double mouseX, double mouseY) {");
      const helper = t.indexOf("private int searchMarkAt(double mouseX, double mouseY) {");
      expect(helper, id).toBeGreaterThan(headingAt);
      expect(t, id).toContain("if (this.searchBox == null || this.searchMatches.isEmpty() || this.maxScroll() <= 0) {");
      expect(t, id).toContain("if (mouseX < x + 2 || mouseX > x + 7) {");
      expect(t, id).toContain("if (mouseY >= markTop - 2 && mouseY <= markTop + 2) {");
      // One shared jump helper: index first, so Enter continues from the clicked hit.
      const jump = t.indexOf("private boolean jumpToSearchMark(double mouseX, double mouseY) {");
      const markAt = t.indexOf("int mark = this.searchMarkAt(mouseX, mouseY);", jump);
      const setIndex = t.indexOf("this.searchIndex = mark;", markAt);
      const scroll = t.indexOf("this.scrollToLine(this.searchMatches.get(mark));", setIndex);
      expect(markAt, id).toBeGreaterThan(jump);
      expect(setIndex, id).toBeGreaterThan(markAt);
      expect(scroll, id).toBeGreaterThan(setIndex);
      // Exactly two call sites: the strip branch (top-row marks) and the main chain (all others).
      expect(t.match(/jumpToSearchMark/g), id).toHaveLength(3);
      const clicked = t.indexOf("public boolean mouseClicked");
      const bar = t.indexOf("if (this.searchBox != null && this.searchBarContains(mouseX, mouseY)) {", clicked);
      const counterClick = t.indexOf("this.nextSearchMatch();", bar);
      const stripJump = t.indexOf("if (button == 0 && this.jumpToSearchMark(mouseX, mouseY)) {", counterClick);
      const delegate = t.indexOf("return super.mouseClicked(mouseX, mouseY, button);", stripJump);
      expect(stripJump, id).toBeGreaterThan(counterClick);
      expect(delegate, id).toBeGreaterThan(stripJump);
      const headingClick = t.indexOf("int heading = this.headingAt(mouseX, mouseY);", delegate);
      const mainJump = t.indexOf("if (button == 0 && this.jumpToSearchMark(mouseX, mouseY)) {", headingClick);
      const scrollbarClick = t.indexOf("if (button == 0 && this.scrollbarContains(mouseX, mouseY)) {", mainJump);
      expect(mainJump, id).toBeGreaterThan(headingClick);
      expect(scrollbarClick, id).toBeGreaterThan(mainJump);
    }
  });


  it("pads the body below the find bar and keeps landings aligned to the padded viewport", () => {
    // UI 42.0: the 41.0 landing clamp (target - SEARCH_BAR_CLEARANCE, floored at 0) could never
    // lift the document head, so while the strip was open the first rows stayed buried under it.
    // The template now shifts the whole body down one bar height while the box exists: a single
    // bodyPad() feeds the draw offset, the first-row backscan, the click-to-row mapping, maxScroll
    // and the scroll compensations on open/close. Landings go back to the plain padded-viewport
    // target - the pad itself clears the strip, head and Home included.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private static final int SEARCH_BAR_CLEARANCE = 24;");
      expect(t, id).toContain("private int bodyPad() {\n\t\treturn this.searchBox != null ? SEARCH_BAR_CLEARANCE : 0;\n\t}");
      // Declaration, helper and the close-time compensation - nowhere else.
      expect(t.match(/SEARCH_BAR_CLEARANCE/g), id).toHaveLength(3);
      // One padded viewport consumed by draw, hit testing, the scroll range and both shifts.
      expect(t, id).toContain("return Math.max(0, this.contentHeight() + this.bodyPad() - this.viewportHeight());");
      expect(t, id).toContain("int first = Math.max(0, (scroll - this.bodyPad()) / LINE_HEIGHT);");
      expect(t, id).toContain("int y = bodyTop + this.bodyPad() + i * LINE_HEIGHT - scroll;");
      expect(t, id).toContain("int row = (this.currentScroll() + (int) mouseY - top - this.bodyPad()) / LINE_HEIGHT;");
      // Truncation rounds clicks above the first painted row back onto row 0; guard their span.
      expect(t, id).toContain("if (mouseY < top + this.bodyPad() + row * LINE_HEIGHT - this.currentScroll()) {\n\t\t\treturn -1;\n\t\t}");
      expect(t, id).toContain("this.scrollTo(this.scrollOffset + this.bodyPad(), false);");
      expect(t, id).toContain("this.scrollTo(this.scrollOffset - SEARCH_BAR_CLEARANCE, false);");
      // Landings are back to the plain padded-viewport target; the 41.0 clamp is gone.
      expect(t, id).toContain("int target = this.lineStarts.get(line) * LINE_HEIGHT;\n\t\tthis.scrollTo(target, true, this.scrollDurationFor(target));");
      expect(t, id).not.toContain("target = Math.max(0, target - SEARCH_BAR_CLEARANCE);");
      // Opening: box created, responder wired, view held still - the restore landing may override.
      const toggle = t.indexOf("private void toggleSearch() {");
      const responder = t.indexOf("this.searchBox.setResponder(this::refreshSearch);", toggle);
      const shift = t.indexOf("this.scrollTo(this.scrollOffset + this.bodyPad(), false);", responder);
      const restore = t.indexOf("if (!lastSearchQuery.isEmpty()) {", shift);
      expect(responder, id).toBeGreaterThan(toggle);
      expect(shift, id).toBeGreaterThan(responder);
      expect(restore, id).toBeGreaterThan(shift);
      // Closing: strip gone first, then the shift is undone against the no-pad scroll range.
      const close = t.indexOf("private void closeSearch() {");
      const nullOut = t.indexOf("this.searchBox = null;", close);
      const undo = t.indexOf("this.scrollTo(this.scrollOffset - SEARCH_BAR_CLEARANCE, false);", nullOut);
      expect(nullOut, id).toBeGreaterThan(close);
      expect(undo, id).toBeGreaterThan(nullOut);
    }
  });

  it("clamps the panel to the window and lays the footer out from the live panel size", () => {
    // The spec's width/height are a preference: a 1200x1200 panel is fine on a large display but
    // must not run off a 320x240 scaled window. init() shrinks it to the screen with a 16px margin,
    // every draw path uses the live fields, and generated buttons anchor to the same fields so the
    // footer stays centred and inside the borders after the clamp.
    const ids = ["forge-1.20.1", "fabric-1.20.4", "fabric-1.21.1", "fabric-1.21.4", "forge-1.20.4", "forge-1.21.4", "neoforge-1.20.4", "neoforge-1.21.1", "neoforge-1.21.4"];
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    for (const id of ids) {
      const t = byId.get(id)!.templates.screenClass;
      expect(t, id).toContain("private int panelWidth = PANEL_WIDTH;");
      expect(t, id).toContain("private int panelHeight = PANEL_HEIGHT;");
      expect(t, id).toContain("this.panelWidth = Math.min(PANEL_WIDTH, this.width - 16);");
      expect(t, id).toContain("this.panelHeight = Math.min(PANEL_HEIGHT, this.height - 16);");
      expect(t, id).toContain("int textWidth = this.panelWidth - BODY_SIDE * 2;");
      expect(t, id).toContain("return this.panelHeight - BODY_TOP - FOOTER_HEIGHT;");
      expect(t, id).toContain("left + this.panelWidth");
      // The only bare constants left are the declaration, the field initializer and the clamp.
      expect(t.match(/(?<!\.)\bPANEL_WIDTH\b/g), id).toHaveLength(3);
      expect(t.match(/(?<!\.)\bPANEL_HEIGHT\b/g), id).toHaveLength(3);
    }

    const uiSpec = structuredClone(spec);
    uiSpec.ui = {
      screens: [
        {
          id: "guide",
          width: 1200,
          height: 1200,
          lines: ["hello"],
          buttons: [
            { action: "close", label: "A" },
            { action: "close", label: "B" },
          ],
        },
      ],
    };
    const parsed = parseModSpec(uiSpec);
    expect(parsed.ok, parsed.ok ? "" : parsed.formatted).toBe(true);
    if (!parsed.ok) return;
    const screen = planProject(parsed.spec, requireAdapter("1.21.1", "fabric")).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    // 1200 is the preferred size; the generated layout derives from the live fields instead.
    expect(screen).toContain("PANEL_WIDTH = 1200;");
    expect(screen).toContain("int footerButtonWidth0 = Math.max(1, Math.min(100, (this.panelWidth - 16 - 8 * (2 - 1)) / 2));");
    expect(screen).toContain("int footerRowWidth0 = 2 * footerButtonWidth0 + 8 * (2 - 1);");
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth0) / 2, top + this.panelHeight - 36 + 6, footerButtonWidth0, 20)",
    );
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth0) / 2 + footerButtonWidth0 + 8, top + this.panelHeight - 36 + 6, footerButtonWidth0, 20)",
    );
  });

  it("emits cached wrapped lines, themed panels and navigable buttons for UI 2.0", () => {
    const uiSpec = structuredClone(spec);
    uiSpec.ui = {
      screens: [
        {
          id: "guide",
          title: "Guide",
          key: "K",
          width: 220,
          height: 140,
          lines: ["hello"],
          theme: "dark",
          accent: "#112233",
          animation: "fade",
          buttons: [
            { action: "open", target: "more", label: "More" },
            { action: "close", label: "Close" },
          ],
        },
        { id: "more", title: "More", lines: ["more"] },
      ],
    };
    const parsed = parseModSpec(uiSpec);
    expect(parsed.ok, parsed.ok ? "" : parsed.formatted).toBe(true);
    if (!parsed.ok) return;
    const a = requireAdapter("1.21.1", "fabric");
    const p = planProject(parsed.spec, a);
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain('private static final String[] LINE_KEYS = { "examplemod.screen.guide.line.1" };');
    expect(screen).toContain("this.font.split(");
    expect(screen).toContain("this.rows.add(row);");
    expect(screen).toContain("private static final int ACCENT_COLOR = 0xFF112233;");
    expect(screen).toContain("private static final int ANIMATION_STYLE = 1;");
    expect(screen).toContain("this.minecraft.setScreen(new ModMainMoreScreen(this))");
    expect(screen).toContain("this.minecraft.setScreen(this.parent)");
    expect(screen).toContain("this.displayTitle = this.trimmedTitle();");
    expect(screen).not.toContain("this.font, this.title, left");
    expect(screen).not.toContain("{{");
  });

  it("writes recipes and advancements in each version's own JSON dialect", () => {
    // Verified against vanilla datapack files inside the real jars: 1.21 renamed the item-stack key
    // from "item" to "id" and flattened item predicates to a plain string; 1.20.1 keeps the object forms.
    const adapters = new Map(listAdapters().map((a) => [a.id, a]));
    const fileOf = (adapterId: string, suffix: string) => {
      const p = planProject(spec, adapters.get(adapterId)!);
      const f = p.files.find((x) => x.path.endsWith(suffix));
      expect(f, adapterId + " should emit " + suffix).toBeDefined();
      return JSON.parse(f!.content);
    };

    const fabShaped = fileOf("fabric-1.21.1", "recipe/charged_ruby.json");
    expect(fabShaped.result).toEqual({ id: "examplemod:charged_ruby", count: 1 });
    expect(fabShaped.key).toEqual({ R: { item: "examplemod:ruby" } });
    expect(fileOf("fabric-1.21.1", "recipe/ruby_from_smelting.json").result).toEqual({ id: "examplemod:ruby" });
    expect(fileOf("fabric-1.21.1", "advancement/root.json").display.icon).toEqual({ id: "examplemod:ruby", count: 1 });
    expect(fileOf("fabric-1.21.1", "advancement/root.json").criteria.has_examplemod_ruby.conditions.items[0]).toBe("examplemod:ruby");

    const forgeShaped = fileOf("forge-1.20.1", "recipes/charged_ruby.json");
    expect(forgeShaped.result).toEqual({ item: "examplemod:charged_ruby", count: 1 });
    expect(fileOf("forge-1.20.1", "recipes/ruby_from_smelting.json").result).toBe("examplemod:ruby");
    expect(fileOf("forge-1.20.1", "advancements/root.json").display.icon).toEqual({ item: "examplemod:ruby" });
    expect(fileOf("forge-1.20.1", "advancements/root.json").criteria.has_examplemod_ruby.conditions.items[0]).toEqual({
      items: ["examplemod:ruby"],
    });
  });

  it("uses the version's own datapack directory names for every data file", () => {
    for (const a of listAdapters().filter((x) => declares(x, "recipeShaped"))) {
      const p = planFor(a);
      const dirs = p.files.map((f) => f.path).filter((x) => x.includes("/data/"));
      const singular = a.mcVersion.startsWith("1.21");
      const expectedRecipes = singular ? "/data/examplemod/recipe/" : "/data/examplemod/recipes/";
      const expectedAdv = singular ? "/data/examplemod/advancement/" : "/data/examplemod/advancements/";
      expect(dirs.some((d) => d.includes(expectedRecipes)), a.id + " recipe dir").toBe(true);
      expect(dirs.some((d) => d.includes(expectedAdv)), a.id + " advancement dir").toBe(true);
      // never mix the two conventions in one plan
      expect(dirs.some((d) => d.includes(singular ? "/recipes/" : "/recipe/")), a.id + " mixed recipe dirs").toBe(false);
    }
  });

  it("emits parseable JSON for every generated data/resource file", () => {
    for (const a of listAdapters()) {
      const p = planFor(a);
      for (const f of p.files) {
        if (!f.path.endsWith(".json")) continue;
        expect(() => JSON.parse(f.content), a.id + ": " + f.path).not.toThrow();
      }
    }
  });

  it("generates the entity slice for every adapter that declares it", () => {
    for (const a of listAdapters().filter((x) => declares(x, "entityClass"))) {
      const p = planFor(a);
      const paths = p.files.map((f) => f.path);
      expect(paths, a.id + " entity class").toContain("src/main/java/com/examplemod/entity/ModMainRubyGolemEntity.java");
      expect(paths, a.id + " renderer").toContain("src/main/java/com/examplemod/client/ModMainRubyGolemRenderer.java");
      expect(paths, a.id + " registry").toContain("src/main/java/com/examplemod/ModMainEntities.java");
      const lootDir = a.mcVersion.startsWith("1.21") ? "/loot_table/entities/" : "/loot_tables/entities/";
      expect(paths.some((x) => x.includes(lootDir + "ruby_golem.json")), a.id + " loot path").toBe(true);

      const main = p.files.find((f) => f.path.endsWith("ModMain.java"))!.content;
      expect(main, a.id + " registry init call").toContain("ModMainEntities.");
      const boot = p.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
      expect(boot, a.id + " renderer registration").toContain("ModMainRubyGolemRenderer");
      const loot = JSON.parse(p.files.find((f) => f.path.endsWith("ruby_golem.json"))!.content);
      expect(loot.type).toBe("minecraft:entity");
      expect(loot.pools[0].entries[0].name).toBe("examplemod:ruby");
      expect(loot.pools[0].entries[0].functions[0].count).toEqual({ type: "minecraft:uniform", min: 1, max: 2 });
      const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
      expect(lang["entity.examplemod.ruby_golem"]).toBe("Ruby Golem");
    }
  });

  it("keeps entity attributes and the client model inside adapter data (no version branches in the engine)", () => {
    for (const a of listAdapters().filter((x) => declares(x, "entityClass"))) {
      expect(Object.keys(a.entityKinds).length, a.id).toBeGreaterThan(0);
      expect(a.entityKinds.monster.attributeBase).toMatch(/createMonsterAttributes|createMobAttributes/);
      for (const model of Object.values(a.entityModels)) {
        expect(model.modelClass).toMatch(/^net\.minecraft\./);
        expect(model.modelLayer).toMatch(/^net\.minecraft\..*ModelLayers\.[A-Z_]+$/);
      }
      expect(a.templates.mainClass).toContain("{{REGISTRY_INIT_CALLS}}");
      expect(a.templates.clientBootstrap).toContain("{{ENTITY_RENDERER_REGISTRATIONS}}");
    }
  });

  it("emits a data-generation entry point and Gradle wiring when the spec opts in", () => {
    for (const a of listAdapters().filter((x) => declares(x, "dataGenClass"))) {
      const p = planFor(a);
      const paths = p.files.map((f) => f.path);
      expect(paths, a.id + " datagen entry").toContain("src/main/java/com/examplemod/datagen/ModMainDataGen.java");
      expect(paths, a.id + " example provider").toContain("src/main/java/com/examplemod/datagen/ModMainExampleProvider.java");
      const build = p.files.find((f) => f.path === "build.gradle")!.content;
      expect(build, a.id + " data run task").toMatch(a.loader === "fabric" ? /runDatagen/ : /runData/);
      expect(build, a.id + " generated resources dir").toMatch(/generated/);
      const provider = p.files.find((f) => f.path.endsWith("ModMainExampleProvider.java"))!.content;
      expect(provider).toContain("DataProvider.saveStable");
      expect(provider).not.toContain("{{");
      if (a.loader === "fabric") {
        const meta = JSON.parse(p.files.find((f) => f.path.endsWith("fabric.mod.json"))!.content);
        expect(meta.entrypoints["fabric-datagen"]).toEqual(["com.examplemod.datagen.ModMainDataGen"]);
      }
    }
  });

  it("emits no data-generation wiring when the spec leaves datagen off", () => {
    const off = { ...spec, datagen: false };
    for (const a of listAdapters()) {
      const p = planProject({ ...specFor(a), datagen: false }, a);
      expect(p.files.some((f) => f.path.includes("/datagen/")), a.id + " should not emit datagen classes").toBe(false);
      const build = p.files.find((f) => f.path === "build.gradle")!.content;
      expect(build, a.id + " should not wire a data run").not.toMatch(/runDatagen|runData/);
      // Fabric tolerates an empty entrypoint list (same as the client entrypoint), so accept either form.
      const meta = p.files.find((f) => f.path.endsWith("fabric.mod.json"));
      if (meta) expect(JSON.parse(meta.content).entrypoints["fabric-datagen"] ?? []).toEqual([]);
    }
  });

  it("every adapter declares the build facts the generator relies on", () => {
    for (const a of listAdapters()) {
      expect(a.java).toBeGreaterThanOrEqual(8);
      expect(a.gradleWrapperVersion).toMatch(/^\d+\.\d+/);
      expect(a.contentPaths.lang).toContain("assets/");
      expect(a.langKeys.itemGroup).toContain("{{namespace}}");
      expect(Object.keys(a.templates).length).toBeGreaterThan(15);
      expect(a.notes.length, `${a.id} should document its own traps`).toBeGreaterThan(0);
    }
  });
});

describe("partial adapters fail loudly instead of emitting broken Java", () => {
  // The whole point of stripping a slice is that asking for it must be a clear error, not a
  // plausible-looking plan that produces Java the compiler will reject. Verified by compile:
  // a 1.21.1 entity template does not compile on 1.21.4 (MobRenderer gained a type variable).
  it("rejects a slice the adapter does not declare", () => {
    const partial = listAdapters().find((a) => !declares(a, "entityClass"));
    expect(partial, "expected at least one adapter without the entity slice").toBeDefined();
    const full = structuredClone(spec);
    expect(() => planProject(full, partial!)).toThrow(/does not support content\.entities/);
  });

  it("still generates the slices it does declare", () => {
    const partial = listAdapters().find((a) => !declares(a, "entityClass"))!;
    const p = planProject(specFor(partial), partial);
    expect(p.files.length).toBeGreaterThan(20);
    expect(p.files.some((f) => f.path.endsWith("ModMainItems.java"))).toBe(true);
  });
});

describe("forge mods.toml dependency ranges", () => {
  // Runtime (not compile) checks these: a 1.21.4 jar once declared minecraft [1.20.1,1.21) because
  // the ranges were copied from 1.20.1, and the server refused to load it. Pin them to each target.
  const forges = listAdapters().filter((a) => a.loader === "forge" && a.gradle.loaderVersionRange !== undefined);

  it("covers every forge adapter that declares ranges", () => {
    expect(forges.length).toBe(5);
  });

  for (const a of forges) {
    it(`${a.id} pins loader and minecraft ranges to its own version`, () => {
      const loaderMajor = String(a.loaderVersion).split(".")[0];
      expect(String(a.gradle.loaderVersionRange)).toBe(`[${loaderMajor},)`);
      expect(String(a.gradle.minecraftVersionRange).startsWith(`[${a.mcVersion},`)).toBe(true);
    });
  }
});

describe("forge-1.21.4 dev-run wiring", () => {
  // Runtime (not compile) checks this: Forge 1.21.4 launches forge_userdev_server, which only sees
  // mod classes through ForgeGradle 7's merged source-set output. On FG6 the server found mods.toml
  // but no @Mod classes and died with "constructed 0 mods", so pin the whole wiring here.
  const a = listAdapters().find((x) => x.id === "forge-1.21.4")!;

  it("uses ForgeGradle 7 on the Gradle 9 wrapper it ships", () => {
    expect(String(a.gradle.forgeGradleVersion)).toMatch(/^7\./);
    expect(a.gradleWrapperVersion).toBe("9.5.1");
    expect(a.assetFiles.length).toBeGreaterThan(0);
    for (const f of a.assetFiles) expect(f.asset.startsWith("gradle-9.5.1/")).toBe(true);
  });

  it("enables merge-source-sets and the FG7 mavenizer dependency DSL", () => {
    expect(a.templates.gradleProps).toContain("net.minecraftforge.gradle.merge-source-sets=true");
    expect(a.templates.buildGradle).toContain("minecraft.mavenizer(it)");
    expect(a.templates.buildGradle).toContain("implementation minecraft.dependency(");
    expect(a.templates.buildGradle).not.toContain("mods {");
  });

  it("uses the singular 1.21 datapack directories", () => {
    expect(a.contentPaths.lootTable).toContain("/loot_table/");
    expect(a.contentPaths.mineableTag).toContain("/tags/block/");
  });
});
