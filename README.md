This is an AI Vite + React JS Developer Agent.

Currently I have a frontend website (using Vite + React) and an Express js backend application. In the home page (App.jsx), the user can create, delete and open projects.

Create project will call the create-project api in the backend which will create a vite + react project and run npm install on it.

When the project is created, a memory folder is created inside the folder with project-memory.json which contains the project structure, features, history etc..
Then the project structure is passed to a model to summarize it and update the project-memory.json with another aiProjectStructureAnalysis field. This can be used by other models as context of the project.

But since this memory file is very static and is harder for models to understand, I created a new local embedding service which uses to model all-MiniLM-L6-v2 for embedding. Then it is stored in qdrant vector database.

There is also an sql-lite database which has the following tables:

- projects
- conversations
- messages
  When a project is created, a new instance is added to the projects table. A conversation id is also created and a conversation is also added to the conversations table linked to the project.
  Each project will only have one conversation linked to it.

Then the user can open the project from the frontend.
This will trigger a start project which will run this project in a separate port and show it to the user side by side to a chatbox in the frontend.
When the project is opened, all the messages for that conversation is also retrieved.

I'm using Ollama and local models.

The user can then chat in the chatbox to make changes to the website.
When the user sends a message, first the intent of the message is identified.
If it's general_chat or out_of_scope a predefined text is returned to the frontend.
If it's code_change, a model will assess the details.
If the details from the user request is sufficient, then the program will move to the next process.
If not, the conversation will be set to clarification and a detailed assessment will be send to the user.
In this mode, when the user sends another message, the message is straight away send for assessing details together with all the messages.
If the details are now sufficient, then the program will move to the next process.
If not it will continue with the clarification.

All the messages are added to the messages table linked to the conversation id.

docker running qdrant on http://localhost:6333/
embedding service (python) running on port 8000
frontend running on http://localhost:5173/
backend running on port 5000
