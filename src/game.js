const VIEW_WIDTH = 120;
const VIEW_HEIGHT = 36;
const TICK_MS = 500;
const RARE_EVENT_CHANCE = 1 / (100 * 60 * 60 / (TICK_MS / 1000));

const asciiScreen = document.getElementById("ascii-screen");
const statsPanel = document.getElementById("stats");
const logList = document.getElementById("log");
const toggleSimButton = document.getElementById("toggle-sim");
const stepSimButton = document.getElementById("step-sim");
const togglePlanButton = document.getElementById("toggle-plan");
const buildHouseButton = document.getElementById("build-house");
const buildFarmButton = document.getElementById("build-farm");
const buildWatchtowerButton = document.getElementById("build-watchtower");

let paused = false;
let tickTimer;
let tickCount = 0;
let planningMode = false;
let selectedPlanType = "house";
let cachedCharSize;
let hoverSlot = null;

const state = {
  day: 1,
  hour: 8,
  wood: 60,
  food: 45,
  coin: 30,
  defense: 8,
  morale: 70,
  population: 6,
  threat: 10,
};

const buildingTypes = {
  house: { name: "dom", cost: { wood: 10 }, defense: 0 },
  farm: { name: "farma", cost: { wood: 12 }, defense: 0 },
  watchtower: { name: "strážna veža", cost: { wood: 20 }, defense: 5 },
};

const buildingSprites = {
  house: [
    "  /\\  ",
    " /__\\ ",
    "/|  |\\",
    "||[]||",
  ],
  farm: [
    " _[]_ ",
    "/____\\",
    "|_||_|",
    " |||| ",
  ],
  watchtower: [
    "  /\\  ",
    " /||\\ ",
    " |==| ",
    " |[]| ",
    " |__| ",
  ],
};

const names = [
  "Nora",
  "Marek",
  "Zuzana",
  "Roman",
  "Lara",
  "Filip",
  "Vera",
  "Jakub",
  "Mia",
  "Tomas",
];

const citizens = [];
const buildings = [];
const constructionQueue = [];
const smokeParticles = [];
const clouds = [];
const stars = [];
const plotSlots = [
  { x: 8, y: 21 },
  { x: 20, y: 21 },
  { x: 36, y: 21 },
  { x: 52, y: 21 },
  { x: 70, y: 21 },
  { x: 86, y: 21 },
  { x: 100, y: 21 },
];

const skyline = [
  "        ||      ||     ||   |||||    ||",
  "   ||  |||||  ||||||  ||||  |||||  ||||||",
  "  |||| |||||  ||||||  ||||  |||||  ||||||",
];

const conversationSeeds = {
  greetings: ["Hej", "Nazdar", "Zdravím", "Čau", "Dobré ráno"],
  verbs: ["počul", "videl", "riešil", "plánoval", "rozmýšľal"],
  subjects: [
    "novú farmu",
    "zásoby jedla",
    "obranu mesta",
    "stavebný plán",
    "divné svetlá",
    "zvláštne stopy",
    "zmenu počasia",
    "príchod obchodníka",
  ],
  reactions: ["znie to dobre", "nie som si istý", "musíme to preveriť", "to je super"],
  memoryLeads: ["Pamätám si", "Nezabudnem", "Stále mám v hlave", "Spomínaš si"],
};

function createCitizen(id, role) {
  return {
    id,
    name: names[id % names.length],
    x: 10 + Math.floor(Math.random() * 90),
    y: 28,
    role,
    needs: {
      food: 80,
      rest: 70,
      social: 60,
    },
    mood: 60,
    focus: "idle",
    speech: null,
    lastSpoke: 0,
    friends: new Set(),
    rivals: new Set(),
    memory: [],
  };
}

function initCitizens() {
  const roles = ["farmer", "builder", "guard"];
  for (let i = 0; i < state.population; i += 1) {
    const role = roles[i % roles.length];
    citizens.push(createCitizen(i, role));
  }
  if (citizens.length >= 2) {
    citizens[0].friends.add(citizens[1].id);
    citizens[1].friends.add(citizens[0].id);
  }
}

function initSky() {
  for (let i = 0; i < 70; i += 1) {
    stars.push({
      x: Math.floor(Math.random() * VIEW_WIDTH),
      y: Math.floor(Math.random() * 10),
      twinkle: Math.random() * 10,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    clouds.push({
      x: Math.floor(Math.random() * VIEW_WIDTH),
      y: 4 + i * 2,
      speed: 0.2 + Math.random() * 0.3,
    });
  }
}

function logMessage(message) {
  const item = document.createElement("li");
  item.textContent = `[D${state.day} ${state.hour}:00] ${message}`;
  logList.prepend(item);
  while (logList.children.length > 8) {
    logList.removeChild(logList.lastChild);
  }
}

function rememberCitizen(citizen, entry) {
  citizen.memory.push(entry);
  if (citizen.memory.length > 12) {
    citizen.memory.shift();
  }
}

function rememberAll(entry) {
  citizens.forEach((citizen) => rememberCitizen(citizen, entry));
}

function makeSentence(citizen) {
  const { greetings, verbs, subjects, reactions, memoryLeads } = conversationSeeds;
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const reaction = reactions[Math.floor(Math.random() * reactions.length)];
  const memoryChance = citizen && citizen.memory.length > 0 && Math.random() < 0.4;
  if (memoryChance) {
    const memoryLead = memoryLeads[Math.floor(Math.random() * memoryLeads.length)];
    const memory = citizen.memory[Math.floor(Math.random() * citizen.memory.length)];
    return `${memoryLead} ${memory}.`;
  }
  return `${greeting}, ${verb} som o ${subject}. ${reaction}.`;
}

function canAfford(cost) {
  return Object.entries(cost).every(([resource, amount]) => state[resource] >= amount);
}

function spendResources(cost) {
  Object.entries(cost).forEach(([resource, amount]) => {
    state[resource] -= amount;
  });
}

function addBuilding(type) {
  const template = buildingTypes[type];
  if (!canAfford(template.cost)) {
    logMessage("Nedostatok zdrojov na stavbu.");
    return;
  }
  const slot = plotSlots.find((plot) => !plot.occupied);
  if (!slot) {
    logMessage("Nie je voľné miesto pre novú budovu.");
    return;
  }
  spendResources(template.cost);
  slot.occupied = true;
  constructionQueue.push({
    type,
    x: slot.x,
    y: slot.y,
    sprite: buildingSprites[type],
    progress: 0,
    required: 4,
    name: template.name,
  });
  logMessage(`Naplánovaná stavba: ${template.name}.`);
  rememberAll(`naplánovanú stavbu ${template.name}`);
}

function updateStats() {
  statsPanel.innerHTML = `
    <div>Deň: ${state.day}, Hodina: ${state.hour}:00</div>
    <div>Populácia: ${state.population}</div>
    <div>Drevo: ${state.wood} | Jedlo: ${state.food} | Mince: ${state.coin}</div>
    <div>Morálka: ${state.morale} | Obrana: ${state.defense}</div>
    <div>Hrozba: ${state.threat}</div>
  `;
}

function createBuffer() {
  return Array.from({ length: VIEW_HEIGHT }, () =>
    Array.from({ length: VIEW_WIDTH }, () => " ")
  );
}

function drawText(buffer, x, y, text) {
  for (let i = 0; i < text.length; i += 1) {
    const px = x + i;
    if (px >= 0 && px < VIEW_WIDTH && y >= 0 && y < VIEW_HEIGHT) {
      buffer[y][px] = text[i];
    }
  }
}

function drawSprite(buffer, x, y, sprite) {
  sprite.forEach((line, row) => {
    drawText(buffer, x, y + row, line);
  });
}

function drawMountains(buffer) {
  const ridge = [
    "     /\\      /\\        /\\        /\\      ",
    "   _/  \\__  /  \\__/\\__/  \\__   _/  \\__   ",
    " _/       \\/             \\  \\_/        \\_ ",
  ];
  drawSprite(buffer, 6, 10, ridge);
  drawSprite(buffer, 55, 9, ridge);
}

function drawSkyline(buffer) {
  skyline.forEach((line, index) => {
    drawText(buffer, 14, 15 + index, line);
    drawText(buffer, 68, 15 + index, line);
  });
}

function drawStreet(buffer) {
  drawText(buffer, 0, 29, "-".repeat(VIEW_WIDTH));
  drawText(buffer, 0, 30, "=".repeat(VIEW_WIDTH));
  drawText(buffer, 0, 31, "-".repeat(VIEW_WIDTH));
}

function drawTrees(buffer) {
  const tree = ["  &&  ", " &&&& ", "  ||  "];
  drawSprite(buffer, 4, 22, tree);
  drawSprite(buffer, 60, 22, tree);
  drawSprite(buffer, 110, 22, tree);
}

function drawBuildings(buffer) {
  buildings.forEach((building) => {
    drawSprite(buffer, building.x, building.y, building.sprite);
  });
  constructionQueue.forEach((site) => {
    drawText(buffer, site.x, site.y + site.sprite.length + 1, "[stavba]");
  });
}

function drawStaticTown(buffer) {
  const hall = [
    "      /\\      ",
    "     /  \\     ",
    "    /====\\    ",
    "   / |  | \\   ",
    "  /__|__|__\\  ",
    "  |  []  []|  ",
    "  |   __  |  ",
  ];
  drawSprite(buffer, 44, 18, hall);
}

function drawPlanningGrid(buffer) {
  plotSlots.forEach((slot) => {
    const marker = slot.occupied ? "X" : "+";
    drawText(buffer, slot.x + 2, slot.y - 2, marker);
  });
  if (hoverSlot) {
    drawText(buffer, hoverSlot.x + 1, hoverSlot.y - 2, "[ ]");
  }
}

function updateNeeds(citizen) {
  citizen.needs.food = Math.max(0, citizen.needs.food - 5);
  citizen.needs.rest = Math.max(0, citizen.needs.rest - 4);
  citizen.needs.social = Math.max(0, citizen.needs.social - 3);

  if (state.food > 0 && citizen.needs.food < 50) {
    state.food -= 1;
    citizen.needs.food = Math.min(100, citizen.needs.food + 20);
    logMessage(`${citizen.name} si dal/a jedlo.`);
  }
}

function updateMood(citizen) {
  const avgNeeds =
    (citizen.needs.food + citizen.needs.rest + citizen.needs.social) / 3;
  citizen.mood = Math.round((avgNeeds + state.morale) / 2);
  state.morale = Math.round(
    (state.morale * (citizens.length - 1) + citizen.mood) / citizens.length
  );
}

function moveCitizen(citizen) {
  const dx = Math.random() < 0.5 ? -1 : 1;
  citizen.x = Math.min(108, Math.max(6, citizen.x + dx));
  citizen.y = 27 + Math.floor(Math.random() * 2);
}

function chat(citizen, partner) {
  if (citizen.lastSpoke + 2 > state.hour) return;
  citizen.lastSpoke = state.hour;
  const line = makeSentence(citizen);
  citizen.speech = { text: line, ttl: 6 };
  partner.speech = { text: line, ttl: 6 };
  logMessage(`${citizen.name}: "${line}"`);
  rememberCitizen(citizen, line);
  rememberCitizen(partner, line);

  if (Math.random() < 0.2) {
    citizen.friends.add(partner.id);
    partner.friends.add(citizen.id);
  } else if (Math.random() < 0.06) {
    citizen.rivals.add(partner.id);
    partner.rivals.add(citizen.id);
    logMessage(`${citizen.name} a ${partner.name} sa nepohodli.`);
  }
}

function socialInteractions() {
  citizens.forEach((citizen) => {
    const partner = citizens[Math.floor(Math.random() * citizens.length)];
    if (partner && partner.id !== citizen.id && Math.random() < 0.35) {
      chat(citizen, partner);
      citizen.needs.social = Math.min(100, citizen.needs.social + 8);
    }
  });
}

function spontaneousTalk() {
  citizens.forEach((citizen) => {
    if (!citizen.speech && Math.random() < 0.08) {
      citizen.speech = { text: makeSentence(citizen), ttl: 4 };
      logMessage(`${citizen.name}: "${citizen.speech.text}"`);
      rememberCitizen(citizen, citizen.speech.text);
    }
  });
}

function assignFocus(citizen) {
  const needs = citizen.needs;
  if (needs.food < 40) return "eat";
  if (needs.rest < 35 && state.hour >= 20) return "rest";
  if (needs.social < 30) return "social";
  if (citizen.role === "farmer") return "farm";
  if (citizen.role === "guard") return "patrol";
  if (citizen.role === "builder") return "build";
  return "idle";
}

function resolveAction(citizen) {
  citizen.focus = assignFocus(citizen);
  if (citizen.focus === "farm") {
    state.food += 1;
    if (tickCount % 6 === 0) {
      state.wood += 1;
    }
  }
  if (citizen.focus === "patrol") {
    if (tickCount % 4 === 0) {
      state.defense = Math.min(100, state.defense + 1);
      state.threat = Math.max(0, state.threat - 1);
    }
  }
  if (citizen.focus === "build") {
    const site = constructionQueue[0];
    if (site) {
      site.progress += 1;
      if (site.progress >= site.required) {
        constructionQueue.shift();
        buildings.push({
          type: site.type,
          x: site.x,
          y: site.y,
          sprite: site.sprite,
        });
        const template = buildingTypes[site.type];
        state.defense += template.defense || 0;
        logMessage(`Stavba dokončená: ${site.name}.`);
        rememberAll(`dokončenú stavbu ${site.name}`);
      }
    }
  }
  if (citizen.focus === "social" && Math.random() < 0.2) {
    citizen.needs.social = Math.min(100, citizen.needs.social + 10);
  }
}

function produceResources() {
  const farms = buildings.filter((b) => b.type === "farm").length;
  const houses = buildings.filter((b) => b.type === "house").length;
  state.food += farms * 3 + 2;
  state.wood += 2 + houses;
  state.coin += Math.max(1, Math.floor(state.population / 2));
}

function tickTime() {
  state.hour += 1;
  if (state.hour >= 24) {
    state.hour = 0;
    state.day += 1;
    state.threat = Math.min(100, state.threat + 1);
  }
}

function handleRandomEvents() {
  if (Math.random() < RARE_EVENT_CHANCE) {
    const events = [
      "Zablyslo sa na obzore. Starý pútnik priniesol legendu o skrytom poklade.",
      "Ranná hmla odkryla ruiny s dávnymi znalosťami. Obrana +2.",
      "Neznámy obchodník ponúka zvláštne semená. Jedlo +20.",
    ];
    const event = events[Math.floor(Math.random() * events.length)];
    logMessage(`Vzácny event: ${event}`);
    state.defense += 2;
    state.food += 10;
    rememberAll(event);
  }
}

function handleThreats() {
  if (Math.random() < state.threat / 220) {
    const loss = Math.max(1, Math.round(state.threat / 12));
    state.food = Math.max(0, state.food - loss);
    state.morale = Math.max(0, state.morale - 6);
    logMessage("Zaznamenaná menšia hrozba. Zásoby a morálka klesli.");
    rememberAll("menšiu hrozbu, ktorá oslabila zásoby");
  }
}

function updateCitizens() {
  citizens.forEach((citizen) => {
    updateNeeds(citizen);
    updateMood(citizen);
    resolveAction(citizen);
    moveCitizen(citizen);
    if (citizen.speech) {
      citizen.speech.ttl -= 1;
      if (citizen.speech.ttl <= 0) {
        citizen.speech = null;
      }
    }
  });
}

function updateClouds() {
  clouds.forEach((cloud) => {
    cloud.x += cloud.speed;
    if (cloud.x > VIEW_WIDTH + 10) {
      cloud.x = -10;
    }
  });
}

function addSmoke(x, y) {
  smokeParticles.push({
    x,
    y,
    life: 12,
    drift: Math.random() * 0.6 - 0.3,
  });
}

function updateSmoke() {
  if (tickCount % 3 === 0) {
    addSmoke(58, 18);
    addSmoke(30, 20);
  }
  smokeParticles.forEach((particle) => {
    particle.y -= 1;
    particle.x += particle.drift;
    particle.life -= 1;
  });
  for (let i = smokeParticles.length - 1; i >= 0; i -= 1) {
    if (smokeParticles[i].life <= 0) {
      smokeParticles.splice(i, 1);
    }
  }
}

function drawSky(buffer) {
  stars.forEach((star) => {
    const twinkle = Math.floor((tickCount + star.twinkle) % 10);
    const char = twinkle < 3 ? "*" : ".";
    drawText(buffer, star.x, star.y, char);
  });
  clouds.forEach((cloud) => {
    const cloudText = "~~( )~~";
    drawText(buffer, Math.floor(cloud.x), cloud.y, cloudText);
  });
}

function drawCitizens(buffer) {
  citizens.forEach((citizen) => {
    const marker =
      citizen.role === "farmer"
        ? "ƒ"
        : citizen.role === "guard"
        ? "¤"
        : citizen.role === "builder"
        ? "ß"
        : "@";
    drawText(buffer, citizen.x, citizen.y, marker);
  });
}

function drawSpeechBubbles(buffer) {
  citizens.forEach((citizen) => {
    if (!citizen.speech) return;
    const text = `"${citizen.speech.text}"`;
    const maxWidth = 28;
    const trimmed = text.length > maxWidth ? `${text.slice(0, maxWidth - 3)}...` : text;
    const bubbleX = Math.min(Math.max(1, citizen.x - 2), VIEW_WIDTH - trimmed.length - 2);
    const bubbleY = Math.max(1, citizen.y - 2);
    drawText(buffer, bubbleX, bubbleY, trimmed);
  });
}

function drawSmoke(buffer) {
  smokeParticles.forEach((particle) => {
    const char = particle.life > 8 ? "o" : particle.life > 4 ? "." : "'";
    drawText(buffer, Math.round(particle.x), particle.y, char);
  });
}

function renderFrame() {
  const buffer = createBuffer();
  drawSky(buffer);
  drawMountains(buffer);
  drawSkyline(buffer);
  drawStaticTown(buffer);
  drawBuildings(buffer);
  drawTrees(buffer);
  drawStreet(buffer);
  drawSmoke(buffer);
  if (planningMode) {
    drawPlanningGrid(buffer);
  }
  drawCitizens(buffer);
  drawSpeechBubbles(buffer);

  asciiScreen.textContent = buffer.map((row) => row.join("")).join("\n");
}

function tick() {
  tickCount += 1;
  tickTime();
  produceResources();
  updateCitizens();
  socialInteractions();
  spontaneousTalk();
  handleThreats();
  handleRandomEvents();
  updateClouds();
  updateSmoke();
  updateStats();
  renderFrame();
}

function setPaused(value) {
  paused = value;
  toggleSimButton.textContent = paused ? "Spustiť" : "Pozastaviť";
}

function getCharSize() {
  if (cachedCharSize) return cachedCharSize;
  const style = getComputedStyle(asciiScreen);
  const fontSize = parseFloat(style.fontSize);
  const letterSpacing = parseFloat(style.letterSpacing) || 0;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const width = context.measureText("M").width + letterSpacing;
  cachedCharSize = { width, height: lineHeight };
  return cachedCharSize;
}

function findNearestPlot(col, row) {
  let best = null;
  let bestScore = Infinity;
  plotSlots.forEach((slot) => {
    const dx = Math.abs(col - slot.x);
    const dy = Math.abs(row - slot.y);
    const score = dx + dy;
    if (score < bestScore) {
      bestScore = score;
      best = slot;
    }
  });
  return best;
}

function updateHoverSlot(event) {
  const rect = asciiScreen.getBoundingClientRect();
  const { width, height } = getCharSize();
  const col = Math.floor((event.clientX - rect.left) / width);
  const row = Math.floor((event.clientY - rect.top) / height);
  hoverSlot = findNearestPlot(col, row);
}

function placePlannedBuilding() {
  if (!planningMode || !hoverSlot || hoverSlot.occupied) {
    return;
  }
  const template = buildingTypes[selectedPlanType];
  if (!canAfford(template.cost)) {
    logMessage("Nedostatok zdrojov na plánovanie.");
    return;
  }
  spendResources(template.cost);
  hoverSlot.occupied = true;
  constructionQueue.push({
    type: selectedPlanType,
    x: hoverSlot.x,
    y: hoverSlot.y,
    sprite: buildingSprites[selectedPlanType],
    progress: 0,
    required: 4,
    name: template.name,
  });
  logMessage(`Naplánovaná stavba: ${template.name}.`);
}

toggleSimButton.addEventListener("click", () => {
  setPaused(!paused);
});

stepSimButton.addEventListener("click", () => {
  if (paused) {
    tick();
  }
});

togglePlanButton.addEventListener("click", () => {
  planningMode = !planningMode;
  togglePlanButton.textContent = planningMode ? "Ukončiť plánovanie" : "Plánovanie mesta";
});

buildHouseButton.addEventListener("click", () => {
  selectedPlanType = "house";
  if (!planningMode) {
    addBuilding("house");
  }
});
buildFarmButton.addEventListener("click", () => {
  selectedPlanType = "farm";
  if (!planningMode) {
    addBuilding("farm");
  }
});
buildWatchtowerButton.addEventListener("click", () => {
  selectedPlanType = "watchtower";
  if (!planningMode) {
    addBuilding("watchtower");
  }
});

asciiScreen.addEventListener("mousemove", (event) => {
  if (planningMode) {
    updateHoverSlot(event);
  }
});

asciiScreen.addEventListener("click", () => {
  if (planningMode) {
    placePlannedBuilding();
  }
});

function start() {
  initCitizens();
  initSky();
  addBuilding("house");
  addBuilding("farm");
  addBuilding("watchtower");
  updateStats();
  renderFrame();
  tickTimer = setInterval(() => {
    if (!paused) {
      tick();
    }
  }, TICK_MS);
}

start();
