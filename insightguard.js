"use strict";

// ========================================
// INSIGHTGUARD AI - CODE ANALYSIS ENGINE
// ========================================

const $ = (id) => document.getElementById(id);

const codeInput = $("codeInput");
const languageSelect = $("languageSelect");
const fileInput = $("fileInput");
const folderInput = $("folderInput");
const findingsList = $("findingsList");
const analysisStatus = $("analysisStatus");

let findings = [];
let analyzedFiles = 0;
let analyzedLines = 0;
let chart = null;
let currentFilename = "untitled.py";
let selectedFiles = [];

const sampleCode = `import os

API_KEY = "my-secret-api-key"
password = "admin123"

def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    os.system("echo " + user_id)
    return eval(query)

def calculate_total(items):
    total = 0
    for item in items:
        total = total + item
    return total

# TODO: Add proper error handling
`;

const extensionLanguages = {
  py: "python",
  js: "javascript",
  java: "java",
  css: "css",
  html: "html",
  txt: "auto"
};

// ========================================
// GENERAL HELPERS
// ========================================

function setStatus(message, isError = false) {
  analysisStatus.textContent = message;
  analysisStatus.style.color = isError ? "#fda4af" : "#a5f3c1";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function detectLanguage(code, filename = "") {
  const extension = filename.split(".").pop().toLowerCase();

  if (
    extensionLanguages[extension] &&
    extensionLanguages[extension] !== "auto"
  ) {
    return extensionLanguages[extension];
  }

  if (languageSelect.value !== "auto") {
    return languageSelect.value;
  }

  if (/\bdef\s+\w+\s*\(|\bimport\s+\w+/.test(code)) {
    return "python";
  }

  if (/<(!DOCTYPE|html|body|div)\b/i.test(code)) {
    return "html";
  }

  if (
    /\b(public\s+)?class\s+\w+/.test(code) &&
    /\bstatic\s+void\s+main\b/.test(code)
  ) {
    return "java";
  }

  if (/[.#][\w-]+\s*\{[^}]*:[^}]*\}/s.test(code)) {
    return "css";
  }

  if (/\b(const|let|var)\s+\w+|console\.log\s*\(|=>/.test(code)) {
    return "javascript";
  }

  return "javascript";
}

function addFinding(
  list,
  line,
  severity,
  title,
  description,
  recommendation
) {
  list.push({
    line,
    severity,
    title,
    description,
    recommendation
  });
}

// ========================================
// CODE ANALYSIS
// ========================================

function analyzeCode(code, language) {
  const results = [];
  const lines = code.split("\n");

  function checkLine(
    regex,
    severity,
    title,
    description,
    recommendation
  ) {
    lines.forEach((line, index) => {
      regex.lastIndex = 0;

      if (regex.test(line)) {
        addFinding(
          results,
          index + 1,
          severity,
          title,
          description,
          recommendation
        );
      }
    });
  }

  // Common source-code checks.

  checkLine(
    /\b(TODO|FIXME|HACK)\b/i,
    "Info",
    "Unresolved development note",
    "This line contains a TODO, FIXME, or HACK marker.",
    "Review the note and resolve it before production if necessary."
  );

  checkLine(
    /\bconsole\.log\s*\(|\bprint\s*\(/,
    "Info",
    "Debug output detected",
    "A print or console logging statement was found.",
    "Remove unnecessary debugging output before deployment. Keep useful logging where appropriate."
  );

  checkLine(
    /\b(api[_-]?key|secret[_-]?key|password|passwd|access[_-]?token)\b\s*[:=]\s*["'][^"']{3,}["']/i,
    "High",
    "Possible hardcoded secret",
    "A credential-like variable appears to contain a literal string.",
    "Use a secret manager or environment variable. Rotate the value if it is a real credential."
  );

  // Python checks.

  if (language === "python") {
    checkLine(
      /\beval\s*\(/,
      "High",
      "Dynamic code execution with eval()",
      "eval() can execute dynamically supplied Python expressions.",
      "Avoid eval() for untrusted input. Use explicit parsing or safer alternatives."
    );

    checkLine(
      /\bexec\s*\(/,
      "High",
      "Dynamic code execution with exec()",
      "exec() executes dynamically constructed Python code.",
      "Avoid executing untrusted strings and validate inputs carefully."
    );

    checkLine(
      /\bos\.system\s*\(/,
      "High",
      "Shell command execution",
      "os.system() runs a command through a system shell.",
      "Prefer subprocess APIs with argument lists and avoid passing untrusted input to commands."
    );

    checkLine(
      /\bsubprocess\.(call|run|Popen)\s*\([^)\n]*shell\s*=\s*True/,
      "High",
      "Shell execution option enabled",
      "Shell execution can create command-injection risks when input is not controlled.",
      "Avoid shell=True when possible. Pass a list of arguments and validate inputs."
    );

    checkLine(
      /\bpickle\.loads?\s*\(/,
      "High",
      "Unsafe deserialization candidate",
      "Loading untrusted pickle data can execute arbitrary code.",
      "Never unpickle untrusted data. Consider a safer data format such as JSON."
    );

    checkLine(
      /\bexcept\s*:/,
      "Medium",
      "Bare exception handler",
      "A bare except clause can hide unexpected errors.",
      "Catch specific exceptions and handle or log them appropriately."
    );

    checkLine(
      /\bassert\s+/,
      "Info",
      "Assertion used in application code",
      "Python assertions can be disabled in optimized execution.",
      "Use explicit validation and exceptions for checks that must always run."
    );
  }

  // JavaScript checks.

  if (language === "javascript") {
    checkLine(
      /\beval\s*\(/,
      "High",
      "Dynamic code execution with eval()",
      "eval() executes a string as JavaScript code.",
      "Avoid eval(), especially with untrusted input. Use structured data parsing instead."
    );

    checkLine(
      /\.innerHTML\s*=/,
      "Medium",
      "Potential unsafe HTML insertion",
      "Assigning dynamic strings to innerHTML may introduce cross-site scripting risks.",
      "Use textContent for plain text or sanitize HTML with a trusted sanitizer."
    );

    checkLine(
      /\bdocument\.write\s*\(/,
      "Medium",
      "document.write() usage",
      "Writing HTML directly into the document can cause security and maintenance issues.",
      "Use DOM methods such as createElement() and textContent."
    );

    checkLine(
      /\bMath\.random\s*\(/,
      "Info",
      "Non-cryptographic random generator",
      "Math.random() is not suitable for security-sensitive tokens.",
      "Use crypto.getRandomValues() or an appropriate cryptographic API for security purposes."
    );
  }

  // Java checks.

  if (language === "java") {
    checkLine(
      /\bRuntime\.getRuntime\s*\(\s*\)\s*\.exec\s*\(/,
      "High",
      "External command execution",
      "Executing operating-system commands can be dangerous when input is not controlled.",
      "Avoid passing untrusted input to commands. Validate inputs and use safer APIs."
    );

    checkLine(
      /\bStatement\s+\w+\s*=.*createStatement\s*\(/,
      "Info",
      "SQL statement construction to review",
      "A regular JDBC Statement was detected; inspect how queries are built.",
      "Use PreparedStatement with parameterized values for database queries."
    );

    checkLine(
      /new\s+Random\s*\(/,
      "Info",
      "Non-cryptographic random generator",
      "java.util.Random is not designed for security-sensitive values.",
      "Use SecureRandom for tokens and other security-sensitive random values."
    );

    checkLine(
      /\bprintStackTrace\s*\(/,
      "Low",
      "Stack trace printed directly",
      "Printing stack traces directly may expose implementation details.",
      "Use structured logging and avoid revealing sensitive details to end users."
    );
  }

  // HTML checks.

  if (language === "html") {
    checkLine(
      /<script\b[^>]*>[\s\S]*<\/script>/i,
      "Info",
      "Inline script block",
      "Inline JavaScript was detected in the HTML.",
      "Consider separating scripts into dedicated files and applying a suitable Content Security Policy."
    );

    checkLine(
      /\son\w+\s*=\s*["']/i,
      "Medium",
      "Inline event handler",
      "Inline event handlers can complicate content security policies.",
      "Consider registering event listeners from a separate JavaScript file."
    );

    checkLine(
      /<iframe\b(?![^>]*\bsandbox\b)[^>]*>/i,
      "Medium",
      "Iframe without sandbox attribute",
      "An iframe without sandbox restrictions may have broader capabilities.",
      "If appropriate for your use case, add a restrictive sandbox attribute."
    );
  }

  // CSS checks.

  if (language === "css") {
    checkLine(
      /!important\b/,
      "Info",
      "CSS !important override",
      "The !important declaration can make styling harder to maintain.",
      "Prefer improving selector structure and removing conflicting rules where possible."
    );

    checkLine(
      /position\s*:\s*fixed/i,
      "Info",
      "Fixed-position element",
      "Fixed-position elements can overlap content on smaller screens.",
      "Test mobile layouts and verify the element does not obstruct important content."
    );
  }

  // Generic review checks.

  checkLine(
    /\b(password|api[_-]?key|secret|token)\b/i,
    "Info",
    "Sensitive identifier needs review",
    "This line references a credential-like identifier.",
    "Confirm sensitive values are handled securely. This rule does not prove a secret is exposed."
  );

  // Remove duplicate findings for the same line and title.

  const seen = new Set();

  return results
    .filter(item => {
      const key = `${item.line}-${item.title}`;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const priority = {
        High: 0,
        Medium: 1,
        Low: 2,
        Info: 3
      };

      return priority[a.severity] - priority[b.severity] ||
        a.line - b.line;
    });
}

// ========================================
// LOWER, GRADUAL RISK SCORE
// ========================================

function calculateRisk(results) {
  let weightedScore = 0;

  results.forEach(item => {
    if (item.severity === "High") {
      weightedScore += 10;
    } else if (item.severity === "Medium") {
      weightedScore += 4;
    } else if (item.severity === "Low") {
      weightedScore += 1;
    } else {
      weightedScore += 0.25;
    }
  });

  // Diminishing returns prevent the score from
  // reaching 100 too quickly when many findings exist.
  const risk = 100 * (1 - Math.exp(-weightedScore / 100));

  return Math.min(100, Math.round(risk));
}

// ========================================
// CHART
// ========================================

function updateChart(results) {
  const counts = {
    High: 0,
    Medium: 0,
    Low: 0,
    Info: 0
  };

  results.forEach(item => {
    if (counts[item.severity] !== undefined) {
      counts[item.severity]++;
    }
  });

  $("chartTotal").textContent = results.length;

  const canvas = $("resultsChart");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["High", "Medium", "Low", "Info"],
      datasets: [{
        data: [
          counts.High,
          counts.Medium,
          counts.Low,
          counts.Info
        ],
        backgroundColor: [
          "#fb365d",
          "#fbbf24",
          "#60a5fa",
          "#a78bfa"
        ],
        borderColor: "#14142b",
        borderWidth: 4,
        hoverOffset: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "#191932",
          padding: 12
        }
      }
    }
  });
}

// ========================================
// DISPLAY FINDINGS AND FILTERS
// ========================================

function renderFindings() {
  const query = $("searchFindings").value.trim().toLowerCase();
  const severity = $("severityFilter").value;

  const filtered = findings.filter(item => {
    const matchesSeverity =
      severity === "all" || item.severity === severity;

    const text = [
      item.title,
      item.description,
      item.recommendation,
      item.filename || "",
      String(item.line)
    ].join(" ").toLowerCase();

    return matchesSeverity && text.includes(query);
  });

  if (!filtered.length) {
    findingsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <h3>${findings.length
          ? "No matching findings"
          : "No issues detected by these checks"}</h3>
        <p>${findings.length
          ? "Try a different search term or severity filter."
          : "This does not guarantee the code is free from security vulnerabilities."}</p>
      </div>
    `;
    return;
  }

  findingsList.innerHTML = filtered.map(item => `
    <article class="finding-card">
      <div class="finding-top">
        <div>
          <h3 class="finding-title">${escapeHTML(item.title)}</h3>
          <p class="finding-location">Line ${item.line}</p>
          ${item.filename
            ? `<p class="finding-file">File: ${escapeHTML(item.filename)}</p>`
            : ""}
        </div>
        <span class="severity ${item.severity}">
          ${escapeHTML(item.severity)}
        </span>
      </div>

      <p class="finding-description">
        ${escapeHTML(item.description)}
      </p>

      <div class="finding-recommendation">
        <strong>Recommendation:</strong>
        ${escapeHTML(item.recommendation)}
      </div>
    </article>
  `).join("");
}

// ========================================
// RUN ANALYSIS ON ALL SELECTED FILES
// ========================================

function runAnalysis() {
  const button = $("analyzeButton");

  const filesToAnalyze = selectedFiles.length
    ? selectedFiles
    : (
        codeInput.value.trim()
          ? [{
              name: currentFilename || "untitled.py",
              path: currentFilename || "untitled.py",
              code: codeInput.value
            }]
          : []
      );

  if (!filesToAnalyze.length) {
    setStatus(
      "Please enter code, select files, or load a sample before analyzing.",
      true
    );
    codeInput.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "Analyzing...";

  try {
    const combinedFindings = [];
    let totalLines = 0;
    const languages = new Set();

    filesToAnalyze.forEach(file => {
      const code = file.code || "";

      if (!code.trim()) return;

      const language = detectLanguage(code, file.name);

      languages.add(language);

      const fileFindings = analyzeCode(code, language).map(item => ({
        ...item,
        filename: file.path || file.name
      }));

      combinedFindings.push(...fileFindings);
      totalLines += code.split("\n").length;
    });

    findings = combinedFindings;

    analyzedFiles = filesToAnalyze.filter(
      file => (file.code || "").trim()
    ).length;

    analyzedLines = totalLines;

    const risk = calculateRisk(findings);

    const highCount = findings.filter(
      item => item.severity === "High"
    ).length;

    const mediumCount = findings.filter(
      item => item.severity === "Medium"
    ).length;

    $("filesAnalyzed").textContent = analyzedFiles;
    $("issuesDetected").textContent = findings.length;
    $("linesScanned").textContent = analyzedLines;

    $("riskScore").innerHTML =
      `${risk}<span class="percent">/100</span>`;

    // Adjusted thresholds to match the new lower score.
    $("riskLabel").textContent =
      risk >= 40
        ? "Elevated review priority"
        : risk >= 15
          ? "Review recommended"
          : "Low heuristic score";

    $("summaryStatus").textContent = "Completed";

    $("detectedLanguage").textContent =
      languages.size === 1
        ? [...languages][0].charAt(0).toUpperCase() +
          [...languages][0].slice(1)
        : languages.size > 1
          ? "Multiple languages"
          : "Unknown";

    $("lastRun").textContent = new Date().toLocaleTimeString();

    updateLineCount();
    updateChart(findings);
    renderFindings();

    $("assistantTitle").textContent = highCount > 0
      ? "Dr.Bora, let's review these findings."
      : "Analysis complete, Dr.Bora.";

    $("assistantMessage").textContent = highCount > 0
      ? `I reviewed ${analyzedFiles} file(s) and found ${highCount} high-severity and ${mediumCount} medium-severity candidate(s). Check the filename and line number for each finding.`
      : `I reviewed ${analyzedFiles} file(s) and scanned ${analyzedLines} lines, finding ${findings.length} candidate issue(s). These heuristic checks cannot guarantee that code is secure.`;

    setStatus(
      `Analysis completed: ${analyzedFiles} file(s), ${analyzedLines} lines, ${findings.length} finding(s).`
    );

    $("summaryStatus").style.color =
      highCount ? "#fda4af" : "#86efac";

  } catch (error) {
    console.error(error);

    setStatus(
      "An error occurred during analysis. Check the browser console.",
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "⚡ Analyze Code";
  }
}

// ========================================
// LOAD SAMPLE CODE
// ========================================

function loadSample() {
  selectedFiles = [];

  fileInput.value = "";
  folderInput.value = "";

  renderSelectedFiles();

  codeInput.value = sampleCode;
  languageSelect.value = "python";
  currentFilename = "sample.py";

  $("fileLabel").textContent = currentFilename;

  updateLineCount();

  setStatus(
    "Sample Python code loaded. Click Analyze Code to run checks."
  );
}

// ========================================
// LINE COUNT
// ========================================

function updateLineCount() {
  const count = codeInput.value.split("\n").length;

  $("lineCount").textContent =
    `${count} line${count === 1 ? "" : "s"}`;
}

// ========================================
// CLEAR EDITOR AND RESULTS
// ========================================

function clearEditor() {
  selectedFiles = [];

  fileInput.value = "";
  folderInput.value = "";

  renderSelectedFiles();

  analyzedFiles = 0;
  analyzedLines = 0;

  codeInput.value = "";
  currentFilename = "untitled.py";

  $("fileLabel").textContent = currentFilename;

  findings = [];

  $("filesAnalyzed").textContent = "0";
  $("issuesDetected").textContent = "0";
  $("linesScanned").textContent = "0";

  $("riskScore").innerHTML =
    '0<span class="percent">/100</span>';

  $("riskLabel").textContent = "Awaiting analysis";
  $("summaryStatus").textContent = "Not started";
  $("detectedLanguage").textContent = "Unknown";
  $("lastRun").textContent = "—";
  $("chartTotal").textContent = "0";

  renderFindings();
  updateChart([]);
  updateLineCount();

  setStatus("Editor cleared.");
}

// ========================================
// EXPORT JSON REPORT
// ========================================

function exportReport() {
  const report = {
    application: "InsightGuard AI",
    generatedAt: new Date().toISOString(),
    filename: currentFilename,
    filesAnalyzed: analyzedFiles,

    files: selectedFiles.map(
      file => file.path || file.name
    ),

    language: selectedFiles.length
      ? "multiple / per-file detected"
      : detectLanguage(codeInput.value, currentFilename),

    linesScanned: analyzedLines ||
      codeInput.value.split("\n").length,

    riskScore: calculateRisk(findings),
    findingCount: findings.length,
    findings
  };

  const blob = new Blob(
    [JSON.stringify(report, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "insightguard-report.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  setStatus("Report exported as insightguard-report.json.");
}

// ========================================
// MULTI-FILE AND FOLDER UPLOAD
// ========================================

const supportedExtensions = new Set([
  "py",
  "js",
  "java",
  "css",
  "html",
  "txt"
]);

function renderSelectedFiles() {
  const panel = $("selectedFilesPanel");
  const list = $("selectedFilesList");
  const count = $("selectedFilesCount");

  if (!panel || !list || !count) return;

  panel.hidden = selectedFiles.length === 0;
  count.textContent = selectedFiles.length;

  list.innerHTML = selectedFiles.map((file, index) => `
    <div class="selected-file-item">
      <button
        type="button"
        class="selected-file-open"
        data-open-file="${index}"
        title="Load this file into the editor"
      >
        📄 ${escapeHTML(file.path || file.name)}
      </button>

      <button
        type="button"
        class="selected-file-remove"
        data-remove-file="${index}"
        aria-label="Remove ${escapeHTML(file.name)}"
      >
        Remove
      </button>
    </div>
  `).join("");
}

async function addUploadedFiles(fileList) {
  const incoming = Array.from(fileList || []);

  if (!incoming.length) return;

  let added = 0;
  let ignored = 0;

  for (const file of incoming) {
    const relativePath =
      file.webkitRelativePath || file.name;

    const extension = file.name.includes(".")
      ? file.name.split(".").pop().toLowerCase()
      : "";

    if (!supportedExtensions.has(extension)) {
      ignored++;
      continue;
    }

    const alreadySelected = selectedFiles.some(
      item => (item.path || item.name) === relativePath
    );

    if (alreadySelected) {
      continue;
    }

    try {
      const code = await file.text();

      selectedFiles.push({
        name: file.name,
        path: relativePath,
        code
      });

      added++;
    } catch (error) {
      console.error(
        "Could not read file:",
        relativePath,
        error
      );

      ignored++;
    }
  }

  if (added > 0) {
    const lastAdded =
      selectedFiles[selectedFiles.length - 1];

    if (selectedFiles.length === 1) {
      codeInput.value = lastAdded.code;
      currentFilename = lastAdded.name;

      $("fileLabel").textContent = lastAdded.name;

      updateLineCount();
    }

    renderSelectedFiles();

    setStatus(
      `${added} file(s) added. ${selectedFiles.length} file(s) selected in total. Click Analyze Code to scan them all.`
    );

  } else if (ignored > 0) {
    setStatus(
      "No supported files were added. Supported extensions: .py, .js, .java, .css, .html, .txt.",
      true
    );

  } else {
    setStatus("Those files are already in the selection.");
  }

  if (ignored > 0 && added > 0) {
    setStatus(
      `${added} supported file(s) added; ${ignored} unsupported or unreadable file(s) skipped.`
    );
  }
}

// Individual file upload.

fileInput.addEventListener("change", async event => {
  await addUploadedFiles(event.target.files);
  fileInput.value = "";
});

// Whole-folder upload.

folderInput.addEventListener("change", async event => {
  await addUploadedFiles(event.target.files);
  folderInput.value = "";
});

// Open or remove a selected file.

$("selectedFilesList").addEventListener("click", event => {
  const openButton = event.target.closest(
    "[data-open-file]"
  );

  const removeButton = event.target.closest(
    "[data-remove-file]"
  );

  if (openButton) {
    const file =
      selectedFiles[Number(openButton.dataset.openFile)];

    if (!file) return;

    codeInput.value = file.code;
    currentFilename = file.name;

    $("fileLabel").textContent =
      file.path || file.name;

    updateLineCount();

    setStatus(
      `${file.path || file.name} loaded in the editor. Analyze Code will scan all selected files.`
    );
  }

  if (removeButton) {
    const index =
      Number(removeButton.dataset.removeFile);

    selectedFiles.splice(index, 1);

    renderSelectedFiles();

    setStatus("File removed from the selection.");
  }
});

// Remove all selected files.

$("removeAllFilesButton").addEventListener("click", () => {
  selectedFiles = [];

  renderSelectedFiles();

  setStatus(
    "All uploaded files removed. You can analyze code in the editor or upload more files."
  );
});

// ========================================
// EVENT LISTENERS
// ========================================

$("analyzeButton").addEventListener(
  "click",
  runAnalysis
);

$("sampleButton").addEventListener(
  "click",
  loadSample
);

$("clearButton").addEventListener(
  "click",
  clearEditor
);

$("exportButton").addEventListener(
  "click",
  exportReport
);

$("searchFindings").addEventListener(
  "input",
  renderFindings
);

$("severityFilter").addEventListener(
  "change",
  renderFindings
);

codeInput.addEventListener(
  "input",
  updateLineCount
);

languageSelect.addEventListener("change", () => {
  setStatus(
    `Selected language: ${languageSelect.value}.`
  );
});

// ========================================
// INITIAL PAGE SETUP
// ========================================

updateLineCount();
updateChart([]);
renderFindings();

console.log(
  "InsightGuard AI initialized successfully."
);