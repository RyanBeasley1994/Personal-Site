// Interactive terminal. `hooks` lets the terminal reach into the 3D scene and HUD.
export function initTerminal(hooks) {
  const input = document.getElementById("terminal-input");
  const output = document.getElementById("terminal-output");
  const panel = document.getElementById("terminal-panel");
  const history = [];
  let historyIndex = 0;

  const sections = ["intro", "markets", "systems", "terminal", "contact"];

  const commands = {
    help: () => [
      "Available commands:",
      "about     who Ryan is",
      "skills    development and innovation focus",
      "location  where Ryan is based",
      "company   current company",
      "contact   contact details",
      "status    current QTG role and status",
      "shards    progress on the hidden currencies",
      "play      Bull Run (unlocks with all 7 currencies)",
      "goto      jump to a section, e.g. goto markets",
      "trade     fire trades across the globe",
      "sound     toggle ambient sound",
      "date      current local date",
      "clear     clear the terminal"
    ].join("\n"),
    about: "Ryan Beasley is Head of Innovation, a contractor and part owner at Quant Technology Group. He develops forex and prop-firm CRM systems, AI products, risk-management technology and forex platforms.",
    skills: "Forex and prop-firm CRM development, AI innovation, risk management, forex platforms, APIs, automation, infrastructure.",
    location: "Exeter, Devon, United Kingdom.",
    company: "Quant Technology Group. Ryan is a contractor, part owner and Head of Innovation.",
    contact: "Email: ryan@quanttechnology.com",
    status: "Contractor and part owner at Quant Technology Group. Currently leading innovation across AI, risk management, forex platforms and prop-firm CRM technology.",
    date: () => new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: "Europe/London"
    }).format(new Date()),
    whoami: "ryan-beasley",
    pwd: "/home/ryan/beasley.dev",
    ls: "about.txt  projects/  quant/  contact.txt  .vault",
    "cat .vault": () => hooks.isUnlocked() ? "The vault is open. Type unlock." : "Locked. The 7 major currencies are hidden in the scene as coins. Type shards to check progress.",
    shards: () => {
      const { found, total } = hooks.shardProgress();
      if (found === total) return `${found}/${total} majors collected. Type unlock.`;
      return `${found}/${total} majors collected. ${hooks.shardProgress().hint}`;
    },
    unlock: () => {
      if (!hooks.isUnlocked()) {
        const { found, total } = hooks.shardProgress();
        return { text: `Access denied. ${total - found} currencies still missing.`, className: "terminal-error" };
      }
      hooks.celebrate();
      return {
        text: "ACCESS GRANTED\nBull Run is unlocked: an arcade run through the chart. Type play, or hit play in the top bar.\nIf you made it this far, you're the kind of person Ryan wants to hear from. Mention \"vault\" when you email.",
        className: "terminal-secret"
      };
    },
    play: () => hooks.play()
      ? "Launching Bull Run. Esc to exit."
      : { text: `Locked. Collect all ${hooks.shardProgress().total} currencies first. ${hooks.shardProgress().hint}`, className: "terminal-error" },
    sound: () => `Sound ${hooks.toggleSound() ? "on" : "off"}.`,
    trade: () => { hooks.crackCrystal(); return "Firing trades out of London."; },
    drop: () => { hooks.drop(); return "Dropping the bass. Turn sound on if you haven't."; },
    sudo: "Permission denied. Nice try.",
    tesla: "Minimal interface. Maximum focus.",
    purple: "#9d5cff",
    hello: "Hello. Type help to see the available commands.",
    exit: "There is no exit. Only scroll."
  };

  const aliases = {
    "?": "help",
    commands: "help",
    bio: "about",
    where: "location",
    email: "contact",
    uptime: "status",
    hint: "shards",
    currencies: "shards",
    coins: "shards",
    crack: "trade",
    "cat vault": "cat .vault",
    "open vault": "unlock"
  };

  function appendLine(content, className = "terminal-response") {
    const line = document.createElement("div");
    line.className = className;
    line.textContent = content;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function appendCommand(command) {
    const line = document.createElement("div");
    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "$ ";
    const value = document.createElement("span");
    value.className = "value";
    value.textContent = command;
    line.append(prompt, value);
    output.appendChild(line);
  }

  function run(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    history.push(trimmed);
    historyIndex = history.length;
    appendCommand(trimmed);
    hooks.onCommand();

    const requested = trimmed.toLowerCase().replace(/\s+/g, " ");
    const command = aliases[requested] || requested;

    if (command === "clear") {
      output.innerHTML = "";
      return;
    }

    if (command.startsWith("goto")) {
      const target = command.split(" ")[1];
      const index = sections.indexOf(target);
      if (index === -1) {
        appendLine(`Unknown section. Try: goto ${sections.join(" | ")}`, "terminal-error");
      } else {
        appendLine(`Moving to ${target}.`);
        hooks.goto(index);
      }
      return;
    }

    let response = commands[command];
    if (typeof response === "function") response = response();

    if (response && typeof response === "object") {
      appendLine(response.text, response.className);
    } else if (response) {
      appendLine(response);
    } else {
      appendLine(`Command not found: ${trimmed}. Type "help" for available commands.`, "terminal-error");
    }
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      run(input.value);
      input.value = "";
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || "";
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || "";
    } else if (event.key === "Tab") {
      const partial = input.value.trim().toLowerCase();
      if (!partial) return;
      const match = Object.keys(commands).concat("clear", "goto").find((name) => name.startsWith(partial));
      if (match) {
        event.preventDefault();
        input.value = match;
      }
    } else {
      hooks.onKey();
    }
  });

  panel.addEventListener("click", (event) => {
    if (!event.target.closest("a")) input.focus({ preventScroll: true });
  });

  return { print: appendLine };
}
