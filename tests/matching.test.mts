import { decide, resolveNumber, bestInSquad, THRESHOLDS } from "../src/lib/matching.ts";

const results: {n:string;p:boolean;d?:string}[] = [];
const check = (n: string, p: boolean, d?: string) => results.push({ n, p, d });

const ana = "person-ana", luis = "person-luis";
const squad = [
  { personId: ana, shirtNumber: 10 },
  { personId: luis, shirtNumber: 7 },
];

// --- Faces --------------------------------------------------------------
check("strong face files itself", decide({ personId: ana, score: 95 }, null).state === "confirmed");
check("borderline-strong face files", decide({ personId: ana, score: THRESHOLDS.autoFace }, null).state === "confirmed");
check("just under the bar goes to review", decide({ personId: ana, score: 91.9 }, null).state === "review");
check("weak face is unknown, not filed", decide({ personId: ana, score: 79 }, null).state === "unknown");
check("weak face names nobody", decide({ personId: ana, score: 79 }, null).personId === null);

// --- The rule that protects the archive ---------------------------------
const numberOnly = resolveNumber(10, 99, squad);
const d = decide(null, numberOnly);
check("a confident unique number NEVER files alone", d.state === "review", `state=${d.state}`);
check("...but it does reach a human", d.personId === ana);

// --- Corroboration ------------------------------------------------------
const agree = decide({ personId: ana, score: 87 }, resolveNumber(10, 99, squad));
check("medium face + agreeing number files", agree.state === "confirmed" && agree.personId === ana);
const disagree = decide({ personId: ana, score: 87 }, resolveNumber(7, 99, squad));
check("medium face + DISAGREEING number does not file", disagree.state === "review", `state=${disagree.state}`);

// --- Numbers only mean something within a squad -------------------------
const shared = [{ personId: ana, shirtNumber: 10 }, { personId: luis, shirtNumber: 10 }];
check("number worn by two people is not unique", resolveNumber(10, 99, shared).unique === false);
check("...and so identifies nobody", resolveNumber(10, 99, shared).personId === null);
check("number nobody wears is not unique", resolveNumber(23, 99, squad).unique === false);
check("low-confidence number stays out", decide(null, resolveNumber(10, 60, squad)).state === "unknown");

// --- The lookalike case the squad filter exists for ---------------------
const candidates = [
  { externalId: "person-brother", similarity: 97 }, // not in this squad
  { externalId: ana, similarity: 93 },
];
const best = bestInSquad(candidates, new Set([ana, luis]));
check("a better global match outside the squad is ignored", best?.personId === ana, `picked ${best?.personId}`);
check("...at its own score, not the impostor's", best?.score === 93);
check("nobody eligible yields nothing", bestInSquad(candidates, new Set(["someone-else"])) === null);

for (const r of results) console.log(`${r.p ? "PASS" : "FAIL"}  ${r.n}${r.d ? `  (${r.d})` : ""}`);
const failed = results.filter(r => !r.p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
