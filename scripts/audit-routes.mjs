#!/usr/bin/env node
/**
 * Ra soat cuoi cho MISA GRC Demo.
 *
 * 1. Quet route thuc te tu src/app
 * 2. Doi chieu hai chieu voi screens.manifest.json
 * 3. Do link chet trong router.push, router.replace va href
 *
 * Chay:  node scripts/audit-routes.mjs
 *
 * Luu y: file nay co tinh KHONG dung ky tu backtick va khong dung
 * regex literal phuc tap, de tranh loi phan tich cu phap tren editor.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep, basename } from "node:path";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "src", "app");
const SRC_DIR = join(ROOT, "src");
const MANIFEST = join(ROOT, "screens.manifest.json");

const C = {
  reset: "\u001b[0m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
};

let errorCount = 0;
let warnCount = 0;

function title(text) {
  console.log("\n" + C.bold + C.cyan + text + C.reset);
  console.log(C.dim + "-".repeat(text.length) + C.reset);
}

function ok(text) {
  console.log(C.green + "  OK" + C.reset + "  " + text);
}

function warn(text) {
  warnCount += 1;
  console.log(C.yellow + "  CANH BAO" + C.reset + "  " + text);
}

function fail(text) {
  errorCount += 1;
  console.log(C.red + "  LOI" + C.reset + "  " + text);
}

/* ================================================================== */
/* Tien ich chung                                        */
/* ================================================================== */

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function walk(dir, out) {
  const result = out || [];
  if (!existsSync(dir)) return result;

  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, result);
    else result.push(full);
  }
  return result;
}

function hasExt(file, list) {
  for (const ext of list) {
    if (file.endsWith(ext)) return true;
  }
  return false;
}

/** Ky tu can escape khi dua vao regex */
const RE_SPECIAL = ".*+?^${}()|[]\\/";

function escapeRe(text) {
  let out = "";
  for (const ch of text) {
    out += RE_SPECIAL.indexOf(ch) >= 0 ? "\\" + ch : ch;
  }
  return out;
}

/* ================================================================== */
/* 1. Quet route thuc te                                        */
/* ================================================================== */

const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js"];

function scanRoutes() {
  const files = walk(APP_DIR).filter(function (f) {
    return PAGE_FILES.indexOf(basename(f)) >= 0;
  });

  const list = files.map(function (f) {
    const rel = f.slice(APP_DIR.length + 1).split(sep);
    rel.pop(); // bo ten file page

    const segments = rel.filter(function (s) {
      const isGroup = s.startsWith("(") && s.endsWith(")");
      const isSlot = s.startsWith("@");
      return !isGroup && !isSlot;
    });

    let route = "/" + segments.join("/");
    if (route.length > 1) route = route.replace(/\/+$/, "");

    return { route: route, file: f.slice(ROOT.length + 1) };
  });

  list.sort(function (a, b) {
    return a.route.localeCompare(b.route);
  });

  return list;
}

/* ================================================================== */
/* 2. Doi chieu voi manifest                                        */
/* ================================================================== */

function loadManifest() {
  if (!existsSync(MANIFEST)) {
    fail("Khong tim thay screens.manifest.json o thu muc goc");
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (err) {
    fail("screens.manifest.json khong phai JSON hop le: " + err.message);
    process.exit(1);
  }
}

function compareManifest(manifest, actual) {
  const actualSet = new Set(
    actual.map(function (x) {
      return x.route;
    }),
  );

  const declared = [];
  for (const s of manifest.screens) {
    for (const r of s.routes) declared.push({ route: r, screen: s.name });
  }
  const declaredSet = new Set(
    declared.map(function (x) {
      return x.route;
    }),
  );

  title("2. Doi chieu manifest voi route thuc te");

  /* Khai bao trong manifest nhung khong co file page */
  const missing = declared.filter(function (x) {
    return !actualSet.has(x.route);
  });

  if (missing.length === 0) {
    ok("Moi route trong manifest deu co file page");
  } else {
    missing.forEach(function (x) {
      fail(
        'Manifest khai bao "' +
          x.route +
          '" (' +
          x.screen +
          ") nhung khong co file page",
      );
    });
  }

  /* Co file page nhung chua khai bao trong manifest */
  const extra = actual.filter(function (x) {
    return !declaredSet.has(x.route);
  });

  if (extra.length === 0) {
    ok("Moi route thuc te deu duoc khai bao trong manifest");
  } else {
    extra.forEach(function (x) {
      warn(
        'Route "' + x.route + '" chua khai bao trong manifest (' + x.file + ")",
      );
    });
  }

  /* screenCount co khop khong */
  if (manifest.screenCount !== manifest.screens.length) {
    warn(
      "screenCount = " +
        manifest.screenCount +
        " nhung mang screens co " +
        manifest.screens.length +
        " phan tu",
    );
  } else {
    ok("screenCount khop: " + manifest.screens.length + " man hinh");
  }

  /* Thu muc screen co ton tai khong */
  const missingDir = manifest.screens.filter(function (s) {
    return s.screenDir && !existsSync(join(ROOT, s.screenDir));
  });

  if (missingDir.length === 0) {
    ok("Moi screenDir deu ton tai");
  } else {
    missingDir.forEach(function (s) {
      warn('Khong thay thu muc "' + s.screenDir + '" cua man hinh ' + s.name);
    });
  }

  /* Vai tro khai bao co hop le khong */
  const roleKeys = new Set(
    manifest.roles.map(function (r) {
      return r.key;
    }),
  );

  let roleError = 0;
  manifest.screens.forEach(function (s) {
    const all = (s.roles || []).concat(s.editRoles || []);
    all.forEach(function (r) {
      if (!roleKeys.has(r)) {
        roleError += 1;
        fail(
          "Man hinh " + s.name + ' khai bao vai tro khong ton tai: "' + r + '"',
        );
      }
    });
  });
  if (roleError === 0) ok("Moi vai tro khai bao deu hop le");

  return actualSet;
}

/* ================================================================== */
/* 3. Do link chet                                        */
/* ================================================================== */

/** Char class gom dau nhay don, nhay kep va backtick, viet bang ma unicode */
const QUOTE_CLASS = "[\"'\\u0060]";
const NOT_QUOTE = "[^\"'\\u0060]";

const LINK_RE = new RegExp(
  "(?:router\\.(?:push|replace|prefetch)\\(\\s*|href\\s*[=:]\\s*)" +
    QUOTE_CLASS +
    "(" +
    NOT_QUOTE +
    "+)" +
    QUOTE_CLASS,
  "g",
);

/** Doi route Next.js thanh regex, doan [id] khop moi gia tri khong chua dau / */
function toPattern(route) {
  let body = "^";
  let i = 0;

  while (i < route.length) {
    const ch = route[i];

    if (ch === "[") {
      const end = route.indexOf("]", i);
      if (end === -1) {
        body += escapeRe(route.slice(i));
        i = route.length;
        continue;
      }
      body += "[^/]+";
      i = end + 1;
      continue;
    }

    body += escapeRe(ch);
    i += 1;
  }

  return new RegExp(body + "$");
}

/** Bo query, bo hash, thay bien template bang doan gia */
function normalizeLink(raw) {
  let p = raw.split("?")[0].split("#")[0];

  while (true) {
    const start = p.indexOf("${");
    if (start === -1) break;
    const end = p.indexOf("}", start);
    if (end === -1) {
      p = p.slice(0, start) + "X";
      break;
    }
    p = p.slice(0, start) + "X" + p.slice(end + 1);
  }

  return p;
}

function scanLinks(actualSet) {
  title("3. Do link chet trong ma nguon");

  const patterns = [];
  actualSet.forEach(function (r) {
    patterns.push({ route: r, re: toPattern(r) });
  });

  const files = walk(SRC_DIR).filter(function (f) {
    return hasExt(f, [".tsx", ".ts", ".jsx", ".js"]);
  });

  const problems = new Map();

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    LINK_RE.lastIndex = 0;

    let m = LINK_RE.exec(content);
    while (m !== null) {
      const raw = m[1].trim();
      m = LINK_RE.exec(content);

      /* Bo link ngoai, mailto, tel, neo, duong dan tuong doi */
      if (!raw.startsWith("/")) continue;
      if (raw.startsWith("//")) continue;

      const path = normalizeLink(raw);
      if (path === "" || path === "/") continue;

      let matched = false;
      for (const p of patterns) {
        if (p.re.test(path)) {
          matched = true;
          break;
        }
      }
      if (matched) continue;

      const list = problems.get(path) || [];
      list.push(file.slice(ROOT.length + 1));
      problems.set(path, list);
    }
  }

  if (problems.size === 0) {
    ok("Khong phat hien link tro toi route khong ton tai");
    return;
  }

  problems.forEach(function (files, path) {
    const uniq = Array.from(new Set(files));
    const shown = uniq.slice(0, 3).join(", ");
    const rest =
      uniq.length > 3 ? " va " + (uniq.length - 3) + " file khac" : "";
    fail(
      'Link "' +
        path +
        '" khong khop route nao. Xuat hien tai: ' +
        shown +
        rest,
    );
  });
}

/* ================================================================== */
/* Chay                                        */
/* ================================================================== */

console.log(C.bold + "MISA GRC Demo - Ra soat cuoi" + C.reset);

title("1. Route thuc te trong src/app");
const actual = scanRoutes();

if (actual.length === 0) {
  fail("Khong tim thay file page nao trong src/app");
  process.exit(1);
}

actual.forEach(function (x) {
  console.log("  " + C.dim + x.route + C.reset);
});
ok("Tong cong " + actual.length + " route");

const manifest = loadManifest();
const actualSet = compareManifest(manifest, actual);

scanLinks(actualSet);

title("Ket qua");
console.log("  Loi:       " + errorCount);
console.log("  Canh bao:  " + warnCount);

if (errorCount > 0) {
  console.log(
    "\n" +
      C.red +
      "Ra soat that bai, can xu ly cac loi o tren." +
      C.reset +
      "\n",
  );
  process.exit(1);
}
console.log("\n" + C.green + "Ra soat dat." + C.reset + "\n");
