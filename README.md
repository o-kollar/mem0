`mem0` is a self-contained HTML file that functions as a note-taking application. It operates entirely within the browser, using local storage and client-side AI models to provide its features. No data is sent to any server.

#### Live Demo

You can use the application directly at: **https://o-kollar.github.io/mem0/**

#### Core Functionality

*   **Local Storage:** All notes are stored in an SQLite database that runs in the browser via WebAssembly. The database file is persisted locally on your machine using IndexedDB.
*   **Rich Text Editor:** The editor supports basic text formatting (bold, italic, links), headings, and lists. These can be applied via a floating toolbar that appears on text selection or through slash (`/`) commands.
*   **Semantic Search:** The application generates vector embeddings from the text of your notes. This allows you to search for notes based on the contextual meaning of your query, rather than just matching keywords.
*   **3D Visualization:** The vector embeddings of all notes are used to generate a 3D graph using the t-SNE algorithm. In this graph, notes with similar semantic content are positioned closer to each other, providing a visual way to explore relationships in your knowledge base.
*   **Data Portability:** The entire SQLite database can be exported as a standard `.sqlite` file at any time. You can also import a compatible `.sqlite` file, which will overwrite the current database.

#### Technical Stack

*   **Database:** `sql.js` (SQLite compiled to WebAssembly) for all database operations.
*   **AI Models:** `@xenova/transformers` for running sentence-transformer models (e.g., `Xenova/all-MiniLM-L6-v2`) client-side to generate text embeddings.
*   **3D Rendering:** `three.js` is used to render and manage the interactive 3D note graph.
*   **Dimensionality Reduction:** `tsne.js` is used to translate the high-dimensional vectors from the AI model into 3D coordinates for visualization.
*   **Persistence:** The browser's IndexedDB API is used as the storage mechanism for the SQLite database file between sessions.

#### Local Usage

Alternatively, you can run the application locally:
1.  Download the `index.html` file.
2.  Open it in a modern web browser (Chrome, Firefox, Edge, etc.).

On the first launch (either from the link or a local file), the application will download the necessary JavaScript libraries and the selected AI model. After that, it can be used offline.
