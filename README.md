# Streamer companion
## About this project
### What is this?
This project is an attempt at creating a companion for streamers that play games or talk about certain topics.
The bot itself is based on GPT4All which by itself doesn't know anything, in this project I will be attempting to strap a knowledge base that can be extended for any topic to the AI and have it provide info about the questions to the AI so that the AI can use it to summarize or word it as good as possible to answer the given question.

### Inspiration
The project was inspired by the streamer bots that can play games or answer chat messages.

# Status: (prototyping)
##   Roadmap
1. (🚧) Creating the first prototype:<br/>
-&ensp;(✔️) Creating a console for sending testing commands and prompts for the AI and the program<br/> 
-&ensp;(✔️❗) Basic implementation for interacting with the AI<br/>
-&ensp;(✔️) Temporary TTS for output without having to read<br/>
-&ensp;(✔️) Creating a prototype for the knowledge database system<br/>
-&ensp;(🚧) Found a problem with the AI not answering using the given information from the database, looking for a GPT that can be used for this purpose<br/>
&ensp;Options:<br/>
&ensp;&ensp;-&ensp;GPT (OpenAI) (Works but not sure if this is against policy)<br/>
&ensp;&ensp;-&ensp;Testing other AI/GPTs currently since i would love it to be open-source and running locally by the final user
2. (❌) Testing and improving parts that might need it<br/>
-&ensp;(❌) Add more knowledge on a subject to test the summarizing or answering abilities of the AI and so that people can actually start using it<br/>
-&ensp;(❌) Get a better TTS implementation, possibly using a different api/library<br/>
3. (❌) Make the project easier for others to use<br/>
   -&ensp;(❌) Make the console UI look better<br/>
4. (❌) Start extending the knowledge database of the AI<br/>
-&ensp;(❌) Complete the AI's knowledge on subjects<br/>
-&ensp;(❌) Add more subjects over time

# How to use
## Dev's setup
### Tools
 - Node.js
 - Git (optional)
 - Terminal (e.g. PowerShell, Command prompt)

### Using the project without Git
1. Make sure Node.js is installed
2. Download the project and extract to the folder you want to use it in
3. Open a terminal in the folders location and use the following command:
> node .
   
### Using Git
#### Setup
 - Make sure Node.js is installed
 - Open a terminal in the folders location and use the following command:
> git clone https://github.com/YOomDev/streamer-companion

#### Updating
Open a terminal in the folders location and use the following command:
> git pull

# Legal notice
streamer-companion is a GPLv3 program, which allows for free redistribution of its source code.