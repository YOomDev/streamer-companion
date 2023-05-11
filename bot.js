// Project info:
/*
 */

//////////////
// Settings //
//////////////

const filter = false; // Turns the response speech filter on or off

// Priority types for usage when you connect it to a chat with viewers or some other chat sort
const PRIO_DEV = "dev";
const PRIO_CHAT = "chat";

// Priorities for prompt ordering
const PRIORITIES = [
   PRIO_DEV,
   PRIO_CHAT,
];

// Filtering
const filteredMessage = "*Filtered*";
const FILTERED = [
    "test",
];

////////////////////////////////
// Memory for running the bot //
////////////////////////////////

// Knowledge database
const fs = require('fs');
const filetype = ".knowledge";

// Console
const http = require('http');
const express = require('express');
const app = express();
let knowledge_modules = [];

// GPT4All
// Note that the gpt4all we are using has problems by default on windows, instructions for fix below:
// line 65: make sure there is a .exe extension like this -> "/.nomic/gpt4all.exe", this is only needed for some Windows users
const GPT = require('gpt4all').GPT4All;
const chat = new GPT('gpt4all-lora-unfiltered-quantized', true); // Default is 'gpt4all-lora-quantized' model

// Text To Speech
const say = require('say');
let voicesList = [];
function getVoices() { return new Promise((resolve) => { say.getInstalledVoices((err, voice) => { if (err) { console.error(err); } return resolve(voice); }) }) }
async function usingVoices() { voicesList = await getVoices(); console.log(voicesList) }

const capitalCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const characters = capitalCharacters.toLowerCase() + " ";
const normalCharacters = characters + capitalCharacters;
const specialCharacters = ".,:;[]!?(){}=-+<>*%^&$#@!|`\'\"/\\";
const numbers = "0123456789";
const allowedCharacters = capitalCharacters + normalCharacters + specialCharacters + numbers;

// Queue's and busy booleans for all different parts
let tasksBusy  = { speaking: false, thinking: false, listening: false, console: false };
let tasksQueue = { speaking: []   , thinking: []   , listening: []   , console: []    };
let program = null;

////////////////////////
// Streamer companion //
////////////////////////

async function init() {
   console.log("Initializing...");
   await sleep(1); // Wait a second to make sure the chatbot is initialized, just in case
   await chat.init(); // Initialize and download missing files
   console.log("Opening...");
   await chat.open(); // Open the connection with the model
   console.log("Voices:");
   await usingVoices();
   console.log("Initialized!");
}

// Used to check if the AI interface and speaking interface are meant to be kept alive
function isBusy() { return tasksBusy.speaking || tasksBusy.thinking || tasksBusy.listening || tasksBusy.console; }

async function start() {
   await init(); // Make sure the modules are initialized correctly
   while (isBusy()) { await sleep(1); } // Loop until finished

   console.log("AI shutting down...");
   // Make sure the modules are closed correctly
   chat.close();
   program = null;
}

async function parseCommand(cmd) {
   const params = cmd.substring(1,cmd.length).split("\/");
   console.log(params);
   if (equalsCaseSensitive(params[0], "cmd")) {
      switch (params[1]) {
         case "ask":
            ask(PRIO_DEV, concatenate(params, 2));
            break;
         case "say":
            speak(concatenate(params, 2));
            break;
         case "modules":
            const tmp = subList(params, 2);
            findModules();
            for (let i = 0; i < knowledge_modules.length; i++) { knowledge_modules[i].active = contains(tmp, knowledge_modules[i].name); }
            break;
         case "start":
            if (program === null) { program = start(); }
            break;
         case "stop":
            await stopServer();
            break;
         default:
            break;
      }
   }
}

////////////////////
// Text To Speech //
////////////////////

function speak(message) {
   tasksQueue.speaking.push(message);
   if (!tasksBusy.speaking) { speakQueue(); }
}

function speakQueue() {
   tasksBusy.speaking = true;
   const msg = tasksQueue.speaking[0];
   tasksQueue.speaking.splice(0,1);
   say.speak(msg, null, 1.0, (err) => {
      if (err) { tasksBusy.speaking = false; console.error(err); }
      if (tasksQueue.speaking.length > 0) { speakQueue(); }
      else { tasksBusy.speaking = false; }
   });
}

/////////
// GPT //
/////////

function ask(author, prompt, spoken = true) {
   tasksQueue.thinking.push( { author: author, prompt: prompt, spoken: spoken} );
   if (!tasksBusy.thinking) { askQueue().then(() => {}); }
   console.log("Added question");
}

async function askQueue() {
   let current = 0;
   while(tasksQueue.thinking.length > 0) {
      tasksBusy.thinking = true;
      current = getHighestQueueByPriority();
      await chatPrompt(tasksQueue.thinking[current].prompt, tasksQueue.thinking[current].spoken);
      tasksQueue.thinking.splice(current, 1);
   }
   tasksBusy.thinking = false;
}

async function chatPrompt(prompt, spoken) {
   console.log(`Prompt: ${prompt}`);
   console.time('response');
   const response = await chat.prompt(prompt);
   console.timeEnd('response');
   console.log(response);
   const result = cleanResponse(response);
   console.log(result);
   if (spoken) { speak(filterResponse(result)); }
   console.log(`Response: ${result}`);
}

function getHighestQueueByPriority() {
   let topPrio = 1000000000;
   let top = 0;
   for (let i = 0; i < tasksQueue.thinking.length; i++) {
      const prio = PRIORITIES.indexOf(tasksQueue.thinking[i].author);
      if (prio === 0) { return i; }
      if (prio < topPrio) {
         topPrio = prio;
         top = i;
      }
   }
   return top;
}

// Used to filter the responses if the setting is turned on so that it can be used in situations where the AI is not allowed to say certain things
function filterResponse(response) { return (filter && containsFromList(response, FILTERED, true)) ? filteredMessage : response; }

// Used to clean the response from gpt4all since it usually includes some gibberish from piping the text to this application
function cleanResponse(response) {
   let result = "";
   for (let i = 0; i < response.length; i++) { if (allowedCharacters.indexOf(response[i]) >= 0) { result += response[i]; } }
   return result.substring(findFirstCapitalCharacter(result), result.length);
}

///////////////////////
// Voice recognition //
///////////////////////

// tasksBusy.listening = true;
// TODO: implement

////////////////////////
// Knowledge database //
////////////////////////

function getInfo(question) {
   // Check what modules are needed to answer this
   const keywords = unDupeList(toTextOnly(question).split(" "));
   let required = [];
   for (let i = 0; i < keywords.length; i++) {
      for (let j = 0; j < knowledge_modules.length; j++) {
         if (knowledge_modules[j].active) {
            if (hasModuleKnowledge(knowledge_modules[j], keywords[i])) { required.push(keywords); break; }
         }
      }
   }

   // Check which dependencies each module needs
   let dependencies = [];
   for (let i = 0; i < required.length; i++) {
      // TODO
   }

   // Gather all the info in one place
   let modules = unDupeList(combineLists(dependencies, required));
   let result = "";
   for (let i = 0; i < modules.length; i++) { result += (result.length > 0 ? " " : "") + getModuleInfo(modules[i]); }
   return result;
}

function hasModuleKnowledge(module, knowledge) {
   const directoryEntries = fs.readdirSync("knowledge\/" + module, { withFileTypes: true });
   for (let i = 0; i < directoryEntries.length; i++) {
      if (directoryEntries[i].isFile() && directoryEntries[i].name.endsWith(filetype)) {
         if (equalsCaseSensitive(directoryEntries[i].name.substring(0, directoryEntries[i].name.length - filetype.length), knowledge)) { return true; }
      }
   }
   return false;
}

function getModuleInfo(knowledge) {
   let result = "";
   // TODO
   return result;
}

function getModuleKnowledgeDependencies() {
   let result = [];
   // TODO
   return result;
}

function findModules() {
   let list = [];
   const directoryEntries = fs.readdirSync("knowledge", { withFileTypes: true });
   for (let i = 0; i < directoryEntries.length; i++) {
      if (directoryEntries[i].isDirectory()) { addModuleToList(directoryEntries[i].name, list); }
   }
   return list;
}

function addModuleToList(name, list, checked = false) { list.push({ name: name, active: checked ? checked : wasChecked(name) }); }

function wasChecked(name) {
   for (let i = 0; i < knowledge_modules.length; i++) {
      if (equalsCaseSensitive(knowledge_modules[i].name, name)) { return knowledge_modules[i].active; }
   }
   return false;
}

///////////////////
// Control panel //
///////////////////

// Setup express for usage
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

// Set command interface through page get
app.get("/cmd/*", (req, res) => {
   res.redirect("/"); // redirects back to the home page
   parseCommand(req.url).catch((err) => { console.error(err); });
});

// Set main page get implementation
app.get("/", (req, res) => { res.render("index", { modules: generateModulesHTML() }); });

// Start the server
const server = http.createServer(app);
server.listen(3000, () => { tasksBusy.console = true; });

// Used to kill the server
async function stopServer() { server.close((err) => { console.error(err); }); if (program !== null) { tasksBusy.console = false; await program; } process.exit(); }

function generateModulesHTML() {
   knowledge_modules = findModules();
   let result = "";
   for (let i = 0; i < knowledge_modules.length; i++) { result += "<input name=\"module\" type=\"checkbox\" value=\"" + knowledge_modules[i].name + "\"" + (knowledge_modules[i].active ? " checked" : "") + "/><label>" + knowledge_modules[i].name + "</label>"; }
   return result;
}

///////////
// Utils //
///////////

function findFirstCapitalCharacter(str) { return findCapitalCharacter(str, 0); }
function findCapitalCharacter(str, start) { for (let i = start; i < str.length; i++) { if (capitalCharacters.indexOf(str[i]) >= 0) { return i; } } return start; }
async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }
function contains(list, item) { for (let i = 0; i < list.length; i++) { if (equalsCaseSensitive(list[i], item)) { return true; } } return false; }

function containsFromList(txt, list, ignoreCase = false) {
   for (let i = 0; i < list.length; i++) {
      if (txt.indexOf(list[i])) { return true; }
      else if (ignoreCase) { if (txt.toLowerCase().indexOf(list[i].toLowerCase())) { return true; } }
   }
   return false;
}

function equalsCaseSensitive(first, second) {
   switch(first) {
      case second: return true;
      default: return false;
   }
}

function concatenate(list, start = 0, end = 0) {
   if (end === 0) { end = list.length; } else if (list.length) { end = Math.min(end + 1, list.length); } // Makes sure it doesn't go out of the arrays bounds
   let result = "";
   for (let i = start; i < end; i++) { result += (i !== start ? " " : "") + list[i]; }
   return result;
}

function subList(list, start = 0, end = -1) {
   if (end < 0) { end = list.length; }
   let result = [];
   for (let i = start; i < end; i++) { result.push(list[i]); }
   return result;
}

function unDupeList(list) {
   let result = [];
   for (let i =0; i < list.length; i++) { if (!contains(result, list[i])) { result.push(list[i]); } }
   return result;
}

function reverseList(list) {
   let result = [];
   for (let i = list.length - 1; i > -1; i--) { result.push(list[i]); }
   return result;
}

function combineLists(one, two) {
   let result = [];
   for (let i = 0; i < one.length; i++) { result.push(one[i]); }
   for (let i = 0; i < two.length; i++) { result.push(two[i]); }
   return result;
}

function toTextOnly(msg) {
   let result = "";
   for (let i = 0; i < msg.length; i++) { if (contains(normalCharacters, msg[i])) { result += msg[i]; } }
   return result;
}