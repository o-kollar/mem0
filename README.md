mem0 is a single-page HTML application for note-taking that runs entirely in the browser. It uses a client-side AI model to enable semantic search and visualizes the relationships between notes in an interactive 3D graph. All data is stored locally in the browser's IndexedDB.

### Core Features:

*   **Local-First Storage:** All notes are stored in an SQLite database within the browser using `sql.js`, which is persisted via IndexedDB. The application can be used entirely offline.
*   **Rich-Text Editing:** A `contenteditable` div serves as the note editor, with a floating toolbar for basic formatting (bold, italics, headers, lists).
*   **Semantic Search:** An embedded machine learning model generates vector embeddings from note content. This allows for searching based on meaning and context, not just keywords.
*   **3D Note Visualization:** The application uses the t-SNE algorithm to reduce the high-dimensional embeddings into 3D coordinates. These are displayed as an interactive point cloud, clustering semantically similar notes together.
*   **Data Portability:** The entire note database can be exported as a single `.sqlite` file and imported back into the application.

### Technical Implementation

The application is self-contained in a single HTML file and relies on several key JavaScript libraries to function:

1.  **Database:** `sql.js` provides an in-browser SQLite engine. This handles all creation, reading, updating, and deletion of notes. The database state is saved to IndexedDB to persist data between sessions.
2.  **Machine Learning Model:** The `Xenova/all-MiniLM-L6-v2` model is loaded via the `Transformers.js` library. It runs entirely on the client-side to convert the text of each note into a numerical vector (embedding). This process occurs when a note is saved and is used for both search and visualization.
3.  **Search Mechanism:** When a user types a search query, the model generates an embedding for the query text. A cosine similarity calculation is then performed between the query embedding and the stored embeddings of all notes to rank them by relevance.
4.  **3D Visualization:**
    *   **Dimensionality Reduction:** The `tsne.js` library takes the high-dimensional text embeddings and calculates a 3D representation for each note.
    *   **Rendering:** `three.js` is used to render the resulting 3D coordinates as an interactive point cloud, where users can pan, zoom, and click on nodes to navigate to the corresponding note.

### How to Use

To run the application, download the HTML file and open it in a modern web browser (like Chrome, Firefox, or Edge).

On the first launch, the application will download the required AI model (approx. 25MB). This model is then cached by the browser for future use. The interface will guide you through creating your first note.
