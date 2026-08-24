import { describe, expect, it } from "vitest";
import { LEVELS, FORBIDDEN_TOOLS, type Level } from "./levels";
import { TOOLS, TOOL_BY_NAME, type Tool, type ToolMode } from "./tools";
import { modeFor, visibleTools, type Connection } from "./runtime";

/** The smallest thing modeFor and visibleTools actually read. */
function connection(level: Level, overrides: { tool: string; mode: ToolMode }[] = []) {
  return {
    level,
    assistant: { capabilities: overrides },
  } as unknown as Connection;
}

const RANK: Record<ToolMode, number> = { DENY: 0, ASK: 1, ALLOW: 2 };

describe("the trust ladder", () => {
  it("gives every tool a mode at every level", () => {
    for (const tool of TOOLS) {
      for (const level of LEVELS) {
        expect(["ALLOW", "ASK", "DENY"], `${tool.name} at ${level}`).toContain(
          modeFor(connection(level), tool),
        );
      }
    }
  });

  it("never becomes stricter as the level rises", () => {
    for (const tool of TOOLS) {
      const ranks = LEVELS.map((level) => RANK[modeFor(connection(level), tool)]);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i], `${tool.name} got stricter from ${LEVELS[i - 1]} to ${LEVELS[i]}`).
          toBeGreaterThanOrEqual(ranks[i - 1]);
      }
    }
  });

  it("lets read-only read, and only read", () => {
    for (const tool of TOOLS) {
      const mode = modeFor(connection("READ_ONLY"), tool);
      if (tool.group === "Read") {
        expect(mode, `${tool.name} should be readable at READ_ONLY`).toBe("ALLOW");
      } else {
        expect(mode, `${tool.name} must not be usable at READ_ONLY`).toBe("DENY");
      }
    }
  });

  it("hides denied tools instead of advertising them", () => {
    for (const level of LEVELS) {
      const visible = visibleTools(connection(level)).map((t) => t.name);
      for (const tool of TOOLS) {
        const denied = modeFor(connection(level), tool) === "DENY";
        expect(visible.includes(tool.name), `${tool.name} at ${level}`).toBe(!denied);
      }
    }
  });
});

describe("destructive tools", () => {
  const destructive = TOOLS.filter((t) => t.destructive);

  it("has at least one, or this suite proves nothing", () => {
    expect(destructive.length).toBeGreaterThan(0);
  });

  it("never runs unattended, at any level", () => {
    for (const tool of destructive) {
      for (const level of LEVELS) {
        expect(modeFor(connection(level), tool), `${tool.name} at ${level}`).not.toBe("ALLOW");
      }
    }
  });

  it("cannot be waved through by a per-tool override", () => {
    for (const tool of destructive) {
      for (const level of LEVELS) {
        const forced = connection(level, [{ tool: tool.name, mode: "ALLOW" }]);
        expect(modeFor(forced, tool), `${tool.name} overridden to ALLOW at ${level}`).toBe("ASK");
      }
    }
  });

  it("can still be switched off entirely", () => {
    for (const tool of destructive) {
      const off = connection("FULL", [{ tool: tool.name, mode: "DENY" }]);
      expect(modeFor(off, tool)).toBe("DENY");
    }
  });
});

describe("per-tool overrides", () => {
  const ordinary = TOOLS.find((t) => !t.destructive && t.group !== "Read")!;

  it("wins over the level for an ordinary tool", () => {
    expect(modeFor(connection("READ_ONLY", [{ tool: ordinary.name, mode: "ALLOW" }]), ordinary)).toBe(
      "ALLOW",
    );
    expect(modeFor(connection("FULL", [{ tool: ordinary.name, mode: "DENY" }]), ordinary)).toBe(
      "DENY",
    );
  });

  it("only affects the tool it names", () => {
    const other = TOOLS.find((t) => t.name !== ordinary.name && t.group === "Read")!;
    const conn = connection("FULL", [{ tool: ordinary.name, mode: "DENY" }]);
    expect(modeFor(conn, other)).toBe(modeFor(connection("FULL"), other));
  });
});

describe("the registry itself", () => {
  it("has no duplicate tool names", () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    expect(TOOL_BY_NAME.size).toBe(TOOLS.length);
  });

  it("never ships a tool whose name is also refused outright", () => {
    for (const name of Object.keys(FORBIDDEN_TOOLS)) {
      expect(TOOL_BY_NAME.has(name), `${name} is both a tool and forbidden`).toBe(false);
    }
  });

  it("describes every tool it advertises", () => {
    for (const tool of TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(0);
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(typeof tool.summarise({}), `${tool.name} must summarise even empty args`).toBe(
        "string",
      );
    }
  });

  it("marks anything that deletes as destructive", () => {
    // A name-based backstop for the flag: if a tool sounds like it removes
    // something, it had better say so.
    const suspicious = TOOLS.filter((t) => /^(delete|remove|purge|destroy)_/.test(t.name));
    for (const tool of suspicious as Tool[]) {
      expect(tool.destructive, `${tool.name} looks destructive but isn't marked`).toBe(true);
    }
  });
});
