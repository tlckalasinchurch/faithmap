import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.join(__dirname, "FAITHMAP_GATE2_PROTOTYPE.html");
const html = fs.readFileSync(protoPath, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const stubs = {};
global.document = {
  getElementById(id) {
    if (!stubs[id]) {
      stubs[id] = {
        style: {},
        classList: { add() {}, remove() {} },
        innerHTML: "",
        textContent: "",
        value: "",
      };
    }
    return stubs[id];
  },
};
global.window = {};

const wrapped = `${script}\nreturn { state, switchRole, setTab, setViewport, goStep, setMeetingHeld, submitReport, supervisorPass, confirmRevision, bodyLeaderApprove, resolveBlocked, selectNotif, toggleNotifRead, addVisitor, toggleVisitorConsent, resetDemo, render };`;
const api = new Function(wrapped)();

const roles = ["auth", "leader", "supervisor", "body_leader", "pastor", "admin"];
const visited = [];
const htmlAnomalies = [];
for (const r of roles) {
  api.switchRole(r);
  const tabs = r === "auth" ? ["auth"]
    : r === "leader" ? ["report", "my_groups", "inbox"]
    : r === "supervisor" ? ["review", "sup_groups", "inbox"]
    : r === "body_leader" ? ["bl_overview", "bl_assignments", "inbox"]
    : r === "pastor" ? ["pastor_dash", "meeting_brief", "inbox"]
    : ["admin_panel", "admin_audit", "inbox"];
  for (const t of tabs) {
    api.setTab(t);
    for (const s of ["normal", "loading", "empty", "error"]) {
      api.state.uiState = s;
      api.render();
      const out = stubs.mainContent.innerHTML;
      if (!out.trim()) throw new Error(`Empty mainContent for ${r}/${t}/${s}`);
      if (/\bundefined\b|\bNaN\b|\$\{/.test(out)) {
        htmlAnomalies.push(`${r}/${t}/${s}`);
      }
      if (/on(?:click|change|input)="[^"]*\brep\./.test(out)) {
        htmlAnomalies.push(`local-rep-ref:${r}/${t}/${s}`);
      }
    }
    api.state.uiState = "normal";
    api.render();
    visited.push(`${r}:${t}`);
  }
}

// Test Step 1/2/3 + Submit + Supervisor Pass + Body Leader Approve
api.switchRole("leader");
api.goStep(2);
api.goStep(3);
api.submitReport("grp-1");
if (api.state.reports["grp-1"].status !== "submitted") throw new Error("grp-1 submit failed");

api.switchRole("supervisor");
api.supervisorPass("grp-1");
if (!api.state.reports["grp-1"].supervisorReviewedAt) throw new Error("supervisorPass failed");

api.switchRole("body_leader");
api.bodyLeaderApprove("grp-1");
if (api.state.reports["grp-1"].status !== "approved") throw new Error("bodyLeaderApprove failed");

// Test Blocked resolution
api.switchRole("admin");
api.resolveBlocked("body-north");
if (api.state.reports["grp-4"].isBlocked) throw new Error("grp-4 should unblock after co-Body Leader added");

console.log(JSON.stringify({
  jsBoot: "PASS",
  htmlAnomalies,
  totalViewsTested: visited.length * 4,
  workflowE2E: "PASS",
  blockedResolution: "PASS"
}, null, 2));
