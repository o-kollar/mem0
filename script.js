import { createApp, ref, nextTick, watch, onMounted, onUnmounted, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

const API_KEY = "AIzaSyCvtMPDKK4oT_-1RB0MBOYoDwPjme6akoY"; // !!! REPLACE WITH YOUR ACTUAL GEMINI API KEY !!!
const MODEL_NAME = "gemini-2.5-flash-lite-preview-06-17";  // Using a modern, capable model
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

// --- vis.js Graph Manager (No changes here) ---
const visGraphManager = {
    network: null,
    nodes: new vis.DataSet(),
    edges: new vis.DataSet(),
    activeContainerElement: null,
    selectionCallback: null,
    localStorageKey: 'visGraphChatUIData_v3_dataStore',
    isDarkMode: () => document.documentElement.classList.contains('dark'),

    getOptions(isDark) {
        const fontColor = isDark ? '#e2e8f0' : '#1e293b';
        const nodeBg = isDark ? '#334155' : '#f8fafc';
        const nodeBorder = isDark ? '#64748b' : '#cbd5e1';
        const edgeColor = isDark ? '#64748b' : '#94a3b8';

        return {
            autoResize: true,
            height: '100%',
            width: '100%',
            nodes: {
                shape: 'box',
                borderWidth: 1.5,
                color: {
                    background: nodeBg,
                    border: nodeBorder,
                    highlight: { background: isDark ? '#475569' : '#e2e8f0', border: isDark ? '#94a3b8' : '#64748b' }
                },
                font: { color: fontColor, size: 14, face: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
                margin: { top: 10, right: 15, bottom: 10, left: 15 },
                widthConstraint: { minimum: 100, maximum: 200 },
                shapeProperties: { borderRadius: 4 }
            },
            edges: {
                color: { color: edgeColor, highlight: isDark ? '#cbd5e1' : '#475569' },
                arrows: { to: { enabled: false } },
                smooth: { enabled: true, type: 'dynamic' }
            },
            physics: {
                enabled: true,
                barnesHut: { gravitationalConstant: -10000, centralGravity: 0.1, springLength: 150, springConstant: 0.05, damping: 0.1, avoidOverlap: 0.2 },
                solver: 'barnesHut',
                stabilization: { iterations: 1000, fit: true }
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                tooltipDelay: 200,
                navigationButtons: false
            }
        };
    },
    loadFromLocalStorage() {
        try {
            const storedData = localStorage.getItem(this.localStorageKey);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (parsedData && Array.isArray(parsedData.nodes) && Array.isArray(parsedData.edges)) {
                    this.nodes.clear(); this.edges.clear();
                    this.nodes.add(parsedData.nodes); this.edges.add(parsedData.edges);
                    console.log("Vis.js Graph data loaded from localStorage.");
                    return true;
                }
            }
        } catch (error) { console.error("Error loading Vis.js graph data:", error); }
        this.nodes.clear(); this.edges.clear();
        return false;
    },
    saveToLocalStorage() {
        try {
            if (this.network) this.network.storePositions();
            const dataToSave = {
                nodes: this.nodes.get({ fields: ['id', 'label', 'body', 'x', 'y'] }),
                edges: this.edges.get({ fields: ['from', 'to', 'id'] })
            };
            localStorage.setItem(this.localStorageKey, JSON.stringify(dataToSave));
        } catch (error) { console.error("Error saving Vis.js graph data:", error); }
    },
    init() { this.loadFromLocalStorage(); },
    ensureInitialized(containerElement, selectionCallback) {
        if (!containerElement || (this.network && this.activeContainerElement === containerElement)) return;
        this.destroyVisualization();
        this.activeContainerElement = containerElement;
        this.selectionCallback = selectionCallback;
        const data = { nodes: this.nodes, edges: this.edges };
        const options = this.getOptions(this.isDarkMode());
        this.network = new vis.Network(containerElement, data, options);
        this.network.on('click', (params) => {
            const nodeId = params.nodes.length > 0 ? params.nodes[0] : null;
            if (this.selectionCallback) this.selectionCallback(nodeId ? this.nodes.get(nodeId) : null);
        });
        this.network.on('dragEnd', () => this.saveToLocalStorage());
        this.network.on('stabilizationIterationsDone', () => { this.network.storePositions(); this.saveToLocalStorage(); });
    },
    destroyVisualization() {
        if (this.network) { this.network.destroy(); this.network = null; }
        this.activeContainerElement = null; this.selectionCallback = null;
    },
    updateTheme() {
        if (this.network) this.network.setOptions(this.getOptions(this.isDarkMode()));
    },
    zoomToFitAllNodes(duration = 750) {
        if (this.network) this.network.fit({ animation: { duration, easingFunction: 'easeInOutQuad' } });
    },
    resetZoom(duration = 750) {
        if (this.network) this.network.moveTo({ scale: 1.0, animation: { duration, easingFunction: 'easeInOutQuad' } });
    },
    setSelectedNode(nodeId) {
        if (!this.network) return;
        if (nodeId) {
            this.network.selectNodes([nodeId]);
            this.network.focus(nodeId, { scale: 1.2, animation: { duration: 500 } });
        } else {
            this.network.unselectAll();
            this.network.fit({ animation: { duration: 500 } });
        }
    },
    addNode(id, body = "") {
        if (!id || typeof id !== 'string' || id.trim() === "") return { success: false, message: "Key (ID) is required and cannot be empty." };
        id = id.trim();
        if (this.nodes.get(id)) return { success: false, message: `An entry with key "${id}" already exists.` };
        this.nodes.add({ id: id, label: id, body: body || "", title: body || " " });
        this.saveToLocalStorage();
        this.zoomToFitAllNodes();
        return { success: true, message: `Data entry for key "${id}" created.` };
    },
    editNode(currentId, newIdParam, newBodyParam) {
        currentId = currentId ? currentId.trim() : null;
        const newId = newIdParam ? newIdParam.trim() : null;
        if (!currentId) return { success: false, message: "Current key (ID) is required." };
        const node = this.nodes.get(currentId);
        if (!node) return { success: false, message: `Data entry for key "${currentId}" not found.` };
        const idChanged = newId && newId !== currentId;
        if (idChanged && this.nodes.get(newId)) return { success: false, message: `Cannot rename to "${newId}": An entry with that key already exists.` };
        let bodyChanged = typeof newBodyParam === 'string' && node.body !== newBodyParam;
        if (!idChanged && !bodyChanged) return { success: true, message: `Data entry for key "${currentId}" was not changed.` };
        
        if (idChanged) {
            const newNode = { ...node, id: newId, label: newId, body: bodyChanged ? newBodyParam : node.body, title: bodyChanged ? newBodyParam : (node.body || " ") };
            delete newNode.x; delete newNode.y;
            const connectedEdges = this.edges.get({ filter: e => e.from === currentId || e.to === currentId });
            const newEdges = connectedEdges.map(edge => ({ ...edge, from: edge.from === currentId ? newId : edge.from, to: edge.to === currentId ? newId : edge.to }));
            this.nodes.remove(currentId); this.edges.remove(connectedEdges.map(e => e.id));
            this.nodes.add(newNode); this.edges.add(newEdges);
        } else { // Only body changed
            this.nodes.update({ id: currentId, body: newBodyParam, title: newBodyParam || " " });
        }
        this.saveToLocalStorage();
        const selectedNodes = this.network ? this.network.getSelectedNodes() : [];
        if (selectedNodes.length > 0 && selectedNodes[0] === currentId) {
            const finalId = idChanged ? newId : currentId;
            this.setSelectedNode(finalId);
            if(this.selectionCallback) this.selectionCallback(this.nodes.get(finalId));
        }
        let message = `Data entry for key "${currentId}" updated.`;
        if(idChanged) message += ` Renamed to "${newId}".`;
        if(bodyChanged) message += ` Value updated.`;
        return { success: true, message };
    },
    addLink(srcId, tgtId) {
        if (!srcId || !tgtId) return { success: false, message: "Source and target keys are required." };
        srcId = srcId.trim(); tgtId = tgtId.trim();
        if (srcId === tgtId) return { success: false, message: "Cannot link an entry to itself." };
        if (!this.nodes.get(srcId)) return { success: false, message: `Source entry with key "${srcId}" not found.` };
        if (!this.nodes.get(tgtId)) return { success: false, message: `Target entry with key "${tgtId}" not found.` };
        if (this.edges.get({ filter: e => (e.from === srcId && e.to === tgtId) || (e.from === tgtId && e.to === srcId) }).length > 0) {
            return { success: false, message: "Link already exists." };
        }
        this.edges.add({ from: srcId, to: tgtId });
        this.saveToLocalStorage();
        return { success: true, message: `Linked entry "${srcId}" to "${tgtId}".` };
    },
    deleteNode(id) {
        id = id.trim();
        if (!this.nodes.get(id)) return { success: false, message: `Data entry with key "${id}" not found.` };
        const selectedNodes = this.network ? this.network.getSelectedNodes() : [];
        if (selectedNodes.length > 0 && selectedNodes[0] === id) this.selectionCallback(null);
        this.nodes.remove(id);
        this.saveToLocalStorage();
        return { success: true, message: `Data entry for key "${id}" and its links were deleted.` };
    },
    highlightSearch(q) {
        const nq = q ? q.trim().toLowerCase() : "";
        const defaultNodeColor = this.getOptions(this.isDarkMode()).nodes.color;
        const updates = this.nodes.map(node => ({
            id: node.id,
            color: (nq && (node.label.toLowerCase().includes(nq) || (node.body && node.body.toLowerCase().includes(nq))))
                ? defaultNodeColor.highlight
                : { background: defaultNodeColor.background, border: defaultNodeColor.border }
        }));
        if (updates.length > 0) this.nodes.update(updates);
        return { success: true, message: nq ? `Highlighting results for: "${q}".` : "Highlighting cleared." };
    },
    clearGraphData() {
        this.nodes.clear(); this.edges.clear();
        if (this.selectionCallback) this.selectionCallback(null);
        this.saveToLocalStorage();
        return { success: true, message: "Data store cleared. All entries and links have been deleted." };
    }
};

// --- MessageItem Component (No changes here) ---
const MessageItem = {
    props: ['message'], emits: ['edit', 'copy'],
    setup(props, { emit }) {
        const contentRef = ref(null), parsedContent = ref(''), isUser = props.message.role === 'user';
        const graphHostElement = ref(null), isDarkMode = ref(visGraphManager.isDarkMode());
        const selectedRawNode = ref(null);

        const handleNodeSelectionChange = (nodeData) => { selectedRawNode.value = nodeData; };

        const displayedNodeDetails = computed(() => {
            if (selectedRawNode.value && selectedRawNode.value.body && selectedRawNode.value.body.trim() !== '') {
                return { id: selectedRawNode.value.label, parsedBody: marked.parse(selectedRawNode.value.body) };
            }
            return null;
        });

        const closeNodeCard = () => { visGraphManager.setSelectedNode(null); };

        const updateContentAndRenderMath = (text) => {
          if (props.message.isGraphDisplaySlot) { parsedContent.value = ''; return; }
          if (props.message.isError) parsedContent.value = text;
          else if (props.message.role === 'model' || props.message.isSystemToolResponse) parsedContent.value = marked.parse(text || (props.message.isStreaming ? ' ' : ''));
          else parsedContent.value = marked.parse(text || '');
          nextTick(() => {
            if (contentRef.value && !props.message.isError && (props.message.role === 'model' || (text && text.includes('$')))) {
              try { if (typeof renderMathInElement === 'function') renderMathInElement(contentRef.value, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) { console.warn("KaTeX:", e); }
            }
          });
        };
        watch(() => props.message.parts[0].text, (nt) => { if (!props.message.isGraphDisplaySlot) updateContentAndRenderMath(nt); }, { immediate: true });
        watch(() => props.message.isStreaming, (is, was) => { if (was && !is && !props.message.isGraphDisplaySlot) updateContentAndRenderMath(props.message.parts[0].text); });
        watch(selectedRawNode, (newNodeData) => {
            if (newNodeData && newNodeData.body && graphHostElement.value) {
                nextTick(() => {
                    const cardBody = graphHostElement.value.querySelector('.node-details-card-body');
                    if (cardBody && typeof renderMathInElement === 'function' && newNodeData.body.includes('$')) {
                        try { renderMathInElement(cardBody, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) { console.warn("KaTeX in card:", e); }
                    }
                });
            }
        }, { deep: true });

        const handleEdit = () => emit('edit', props.message), handleCopy = () => emit('copy', props.message);

        onMounted(() => {
            if (props.message.isGraphDisplaySlot && graphHostElement.value) {
                isDarkMode.value = visGraphManager.isDarkMode();
                visGraphManager.ensureInitialized(graphHostElement.value, handleNodeSelectionChange);
            }
        });
        onUnmounted(() => {
            if (props.message.isGraphDisplaySlot && visGraphManager.activeContainerElement === graphHostElement.value) {
                visGraphManager.destroyVisualization();
                selectedRawNode.value = null;
            }
        });
        return { isUser, handleEdit, handleCopy, contentRef, parsedContent, message: props.message, graphHostElement, isDarkMode, displayedNodeDetails, closeNodeCard };
    },
    template: `
    <div v-if="message.isGraphDisplaySlot" class="w-full my-3">
        <div ref="graphHostElement" class="graph-host-container" :class="isDarkMode ? 'bg-slate-800' : 'bg-slate-50'">
            <div v-if="displayedNodeDetails" class="node-details-card" :class="{ 'dark': isDarkMode }">
                <h3>{{ displayedNodeDetails.id }}</h3>
                <div class="node-details-card-body prose prose-sm dark:prose-invert max-w-none" v-html="displayedNodeDetails.parsedBody"></div>
                <button @click="closeNodeCard" class="close-btn" title="Close entry details">×</button>
            </div>
        </div>
    </div>
    <div v-else :class="['w-full flex group relative', isUser ? 'justify-end' : 'justify-start']" :data-message-id="message.id">
      <div :class="['max-w-[85%] sm:max-w-[80%]']">
          <div ref="contentRef" :class="['rendered-content prose prose-sm max-w-none', 'prose-p:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1 prose-pre:my-1.5', message.isSystemToolResponse ? 'p-2.5 text-xs italic bg-slate-200 rounded-lg text-slate-500 border border-slate-300' : (message.isError ? 'p-2.5 border border-red-400/50 rounded-lg bg-red-100/70 text-red-700' : (isUser ? 'text-slate-700 text-right' : 'text-slate-800 text-left'))]" v-html="parsedContent"></div>
          <span v-if="message.isStreaming && !message.isError && !message.isSystemToolResponse" :class="['typing-cursor animate-blink mt-0.5', isUser ? 'float-right mr-1' : 'float-left ml-1']"></span>
      </div>
      <div v-if="!message.isError && !message.isSystemToolResponse && !message.isGraphDisplaySlot && (isUser || (!message.isStreaming && message.role === 'model'))" :class="['absolute top-1/2 -translate-y-1/2 flex items-center space-x-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150', isUser ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2']">
          <button v-if="isUser" @click="handleEdit" title="Edit" class="p-1.5 rounded-full bg-slate-100/80 hover:bg-slate-200 text-slate-500 border border-slate-300/70 focus:outline-none focus:ring-1 focus:ring-zinc-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg></button>
          <button @click="handleCopy" title="Copy" class="copy-button p-1.5 rounded-full bg-slate-100/80 hover:bg-slate-200 text-slate-500 border border-slate-300/70 focus:outline-none focus:ring-1 focus:ring-zinc-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg></button>
      </div>
    </div>
  `
};

createApp({
  components: { 'message-item': MessageItem },
  setup() {
    const messages = ref([]), newMessageText = ref(''), editingMessage = ref(null);
    const isLoading = ref(false), chatContainerRef = ref(null);
    const activeTempGraphSlotId = ref(null);
    const GRAPH_DISPLAY_DURATION = 7000;

    // --- UPDATED SYSTEM PROMPT ---
    const SYSTEM_PROMPT = `You are O, an advanced multi-step reasoning assistant with full access to external tools. You combine thoughtful, step-by-step analysis with precise tool use to retrieve, process, and present information.

## How You Work

1. **Plan**
   - Internally break down the user's request into subtasks.
   - Determine the logical order to complete each part.
   - Identify which tools (if any) are needed at each step.

2. **Use Tools Thoughtfully**
   - For real-time, factual, or specialized data, call the appropriate tool.
   - After each call, analyze the result and decide what to do next.

3. **Reason in Steps**
   - Use internal multi-step reasoning.
   - Don't rush to the final answer — think through each layer before concluding.

4. **Present Results**
   - Share a clean, concise summary of your findings with the user.
   - Show lists clearly, answer questions directly, and offer suggestions where helpful.

## Interaction Style

- Match the user's tone: warm, human, clear, and helpful.
- Be conversational, but always grounded and factual.
- Ask clarifying questions when needed, otherwise proceed with initiative.

# Tools  
Your tools are for data management and information retrieval.  
  
## Weather  
- Use 'get_weather_forecast' with a city name for a general summary.  
- To get a detailed hourly forecast for a specific day (e.g., today, tomorrow), provide the 'date' parameter in YYYY-MM-DD format. The current date is provided in the context below.  
  
## Wikipedia Workflow  
- To research a topic, first use 'search_wikipedia_articles' to find relevant pages.  
- **Present the results to the user as a numbered list**, including the title and a brief summary for each.  
- **Wait for the user to select an article** from the list (e.g., "tell me more about #2" or "get the image for the first one").  
- Once the user selects one, use the 'get_wikipedia_article_details' tool to fetch the full summary or image as requested.  
  
## Data Storage (Graph)  
- You can store data as key-value pairs (nodes), link them, and search them.  
- You can chain tool calls. For example, to store data from Wikipedia, first get the details, then call 'store_data'.
---

Remember: Plan first, use tools wisely, and deliver answers clearly. You are here to help users get accurate, actionable insights—step by step.`;

    // --- UPDATED TOOL DEFINITIONS ---
    const geminiTools = [{ functionDeclarations: [
        // Weather Tool
        {
            name: "get_weather_forecast",
            description: "Fetches the weather forecast. Provides a general summary by default, or a detailed hourly forecast for a specific date if provided.",
            parameters: {
                type: "OBJECT",
                properties: {
                    location: { type: "STRING", description: "The city or location to get the weather for (e.g., 'Paris', 'Bratislava')." },
                    date: { type: "STRING", description: "Optional. A specific date to get the hourly forecast for, in YYYY-MM-DD format. If omitted, a general summary is returned." }
                },
                required: ["location"]
            }
        },

        // Data Storage Tools
        { name:"store_data", description:"Stores a new data entry in the key-value store.", parameters:{ type:"OBJECT", properties:{ key:{type:"STRING",description:"The unique key for the new data entry."}, value:{type:"STRING",description:"Optional. The text/Markdown value to be stored for the key."} }, required:["key"] } },
        { name:"update_data", description:"Modifies an existing data entry.", parameters: { type: "OBJECT", properties: { key: {type: "STRING", description: "The current key of the data entry to edit."}, new_key: {type: "STRING", description: "Optional. The new key for the data entry."}, new_value: {type: "STRING", description: "Optional. The new text/Markdown value for the data entry."} }, required: ["key"] } },
        { name:"link_data", description:"Creates a link between two data entries.", parameters:{type:"OBJECT",properties:{source_key:{type:"STRING", description: "The key of the source data entry."},target_key:{type:"STRING", description: "The key of the target data entry."}},required:["source_key","target_key"]}},
        { name:"delete_data", description:"Deletes a data entry by its key.", parameters:{type:"OBJECT",properties:{key:{type:"STRING", description: "The key of the data entry to delete."}},required:["key"]}},
        { name:"search_data", description:"Searches and highlights entries in the data store.", parameters:{type:"OBJECT",properties:{query:{type:"STRING", description: "The search term."}},required:["query"]}},
        { name:"clear_store", description:"Erases the entire data store.", parameters:{type:"OBJECT",properties:{}}},
        { name:"list_data", description:"Lists all data entries in the store.", parameters:{type:"OBJECT",properties:{}}},
        { name:"fetch_and_store_wiki_article", description:"Fetches a Wikipedia article's summary and stores it in the data graph.", parameters: { type: "OBJECT", properties: { topic: { type: "STRING", description: "The topic of the article to fetch and store. This will also be the node's key." } }, required: ["topic"] } },
        
        // Wikipedia Tools
        { 
            name: "search_wikipedia_articles", 
            description: "Searches Wikipedia for a query and returns a list of matching article titles and summaries.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "The term to search for on Wikipedia." } }, required: ["query"] } 
        },
        { 
            name: "get_wikipedia_article_details",
            description: "Gets detailed information for a *specific* Wikipedia article title, like the full summary or the main image.",
            parameters: { type: "OBJECT", properties: { 
                topic: { type: "STRING", description: "The exact title of the Wikipedia article to look up." }, 
                get_summary: { type: "BOOLEAN", description: "Set to true to fetch the full, plain-text introductory summary." },
                get_image: { type: "BOOLEAN", description: "Set to true to fetch the URL of the article's main image." }
            }, required: ["topic"] }
        }
    ]}];

    // --- UPDATED TOOL HELPER ---
    const isGraphTool = (name) => !["search_wikipedia_articles", "get_wikipedia_article_details", "get_weather_forecast"].includes(name);

    // --- UPDATED: WEATHER HANDLER FUNCTION ---
    const handleWeatherForecast = async (args) => {
        const { location, date } = args; // Destructure the new 'date' parameter
        if (!location) {
            return { success: false, message: "A location must be provided for the weather forecast." };
        }
        try {
            const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
            if (!response.ok) {
                if (response.status === 404) {
                    return { success: false, message: `Could not find weather for location: "${location}". Please check the spelling or try a nearby larger city.` };
                }
                throw new Error(`Network error or invalid location. Status: ${response.status}`);
            }
            const weather = await response.json();
            const locationName = `${weather.nearest_area[0].areaName[0].value}, ${weather.nearest_area[0].country[0].value}`;

            // --- NEW LOGIC: Check if a specific date was requested ---
            if (date) {
                 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    return { success: false, message: "Invalid date format. Please use YYYY-MM-DD." };
                }

                const dayData = weather.weather.find(day => day.date === date);

                if (!dayData) {
                    return { success: false, message: `Forecast for ${date} is not available. Only a 3-day forecast is provided.` };
                }

                // Format the hourly data for the selected day
                const hourlyForecast = dayData.hourly.map(hour => {
                    const hour24 = parseInt(hour.time) / 100;
                    const period = hour24 >= 12 ? 'PM' : 'AM';
                    let hour12 = hour24 % 12;
                    if (hour12 === 0) hour12 = 12; // Handle midnight and noon

                    return {
                        time: `${hour12} ${period}`,
                        temp_C: `${hour.tempC}°C`,
                        feels_like_C: `${hour.FeelsLikeC}°C`,
                        description: hour.weatherDesc[0].value,
                        chance_of_rain: `${hour.chanceofrain}%`
                    };
                });
                
                return { 
                    success: true, 
                    data: { 
                        location: locationName,
                        date: date, 
                        hourly_forecast: hourlyForecast 
                    } 
                };
            } else {
                // --- ORIGINAL LOGIC: Return a general summary ---
                const current = weather.current_condition[0];
                const today = weather.weather[0];
                const tomorrow = weather.weather[1];

                const summary = {
                    location: locationName,
                    current_conditions: {
                        description: current.weatherDesc[0].value,
                        temp_C: `${current.temp_C}°C`,
                        feels_like_C: `${current.FeelsLikeC}°C`,
                        humidity: `${current.humidity}%`,
                        wind: `${current.windspeedKmph} km/h from ${current.winddir16Point}`
                    },
                    today_forecast: {
                        date: today.date,
                        max_temp_C: `${today.maxtempC}°C`,
                        min_temp_C: `${today.mintempC}°C`,
                        summary: today.hourly[4].weatherDesc[0].value, // Mid-day (noon) description
                        sunrise: today.astronomy[0].sunrise,
                        sunset: today.astronomy[0].sunset
                    },
                    tomorrow_forecast: {
                        date: tomorrow.date,
                        max_temp_C: `${tomorrow.maxtempC}°C`,
                        min_temp_C: `${tomorrow.mintempC}°C`,
                        summary: tomorrow.hourly[4].weatherDesc[0].value
                    }
                };
                return { success: true, data: summary };
            }
        } catch (e) {
            console.error("Weather fetch failed:", e);
            return { success: false, message: `Error fetching weather data: ${e.message}` };
        }
    };
    
    // --- WIKIPEDIA HANDLER FUNCTIONS ---
    const handleWikipediaSearch = async (args) => {
        const { query } = args;
        if (!query) return { success: false, message: "A search query must be provided." };
        const endpoint = 'https://en.wikipedia.org/w/api.php';
        
        const searchParams = new URLSearchParams({
            action: 'query', list: 'search', srsearch: query, srlimit: '5', format: 'json', origin: '*'
        });
        const searchResponse = await fetch(`${endpoint}?${searchParams}`);
        if (!searchResponse.ok) throw new Error('Wikipedia search request failed');
        const searchData = await searchResponse.json();
        const searchResults = searchData.query.search;

        if (searchResults.length === 0) return { success: true, data: { results: [] } };
        
        const titles = searchResults.map(r => r.title);
        const extractParams = new URLSearchParams({
            action: 'query', prop: 'extracts', titles: titles.join('|'), exintro: true, explaintext: true, format: 'json', origin: '*'
        });
        const extractResponse = await fetch(`${endpoint}?${extractParams}`);
        if (!extractResponse.ok) throw new Error('Wikipedia extract request failed');
        const extractData = await extractResponse.json();
        const pages = extractData.query.pages;

        const combinedResults = searchResults.map(searchResult => {
            const pageData = Object.values(pages).find(p => p.pageid === searchResult.pageid);
            return {
                title: searchResult.title,
                pageid: searchResult.pageid,
                summary: pageData ? pageData.extract : 'No summary available.'
            };
        });
        
        return { success: true, data: { results: combinedResults }};
    };

    const handleWikipediaDetails = async (args) => {
        const { topic, get_summary, get_image } = args;
        if (!topic) return { success: false, message: "A topic must be provided." };

        const endpoint = 'https://en.wikipedia.org/w/api.php';
        const params = new URLSearchParams({
            action: 'query', titles: topic, format: 'json', redirects: '1', origin: '*'
        });

        const props = [];
        if (get_summary) {
            props.push('extracts');
            params.set('exintro', true);
            params.set('explaintext', true);
        }
        if (get_image) {
            props.push('pageimages');
            params.set('pithumbsize', 400); 
        }

        if (props.length === 0) return { success: false, message: "No action requested." };
        params.set('prop', props.join('|'));

        try {
            const response = await fetch(`${endpoint}?${params}`);
            if (!response.ok) throw new Error(`Wikipedia API error: ${response.statusText}`);
            const data = await response.json();
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];

            if (!pageId || pageId === "-1") return { success: true, data: { message: `Could not find a Wikipedia article for "${topic}".` } };
            
            const page = pages[pageId];
            const result = { title: page.title, url: `https://en.wikipedia.org/?curid=${page.pageid}` };
            if (get_summary) result.summary = page.extract;
            if (get_image && page.thumbnail) result.imageUrl = page.thumbnail.source;
            
            return { success: true, data: result };
        } catch (error) {
            console.error("Wikipedia fetch failed:", error);
            return { success: false, message: `Failed to fetch from Wikipedia: ${error.message}` };
        }
    };

    // --- Central Tool Call Handler ---
    const handleToolCall = async (functionName, args) => {
        let result;
        switch (functionName) {
            // New Weather tool
            case "get_weather_forecast":
                result = await handleWeatherForecast(args);
                break;
            
            // Data Storage tools
            case "store_data": result = visGraphManager.addNode(args.key, args.value); break;
            case "update_data": result = visGraphManager.editNode(args.key, args.new_key, args.new_value); break;
            case "link_data": result = visGraphManager.addLink(args.source_key, args.target_key); break;
            case "delete_data": result = visGraphManager.deleteNode(args.key); break;
            case "search_data": result = visGraphManager.highlightSearch(args.query); break;
            case "clear_store": result = visGraphManager.clearGraphData(); break;
            case "list_data":
                const notes = visGraphManager.nodes.get().map(n => ({ id: n.id, body: n.body }));
                result = { success: true, message: `Found ${notes.length} entries. Displaying all entries.`, data: notes };
                if (result.success) visGraphManager.zoomToFitAllNodes();
                break;
            case "fetch_and_store_wiki_article":
                const wikiDataResult = await handleWikipediaDetails({ topic: args.topic, get_summary: true });
                if (wikiDataResult.success && wikiDataResult.data.summary) {
                    result = visGraphManager.addNode(wikiDataResult.data.title, wikiDataResult.data.summary);
                    result.message = `Successfully fetched "${wikiDataResult.data.title}" and stored it in the graph.`;
                } else {
                    result = { success: false, message: `Could not fetch article for "${args.topic}" to store it.` };
                }
                break;
            
            // Wikipedia tools
            case "search_wikipedia_articles":
                result = await handleWikipediaSearch(args);
                break;
            case "get_wikipedia_article_details":
                result = await handleWikipediaDetails(args);
                break;

            default: result = { success: false, message: `Unknown function: ${functionName}` };
        }
        
        if (result.success && isGraphTool(functionName)) {
            if (activeTempGraphSlotId.value) {
                const oldSlotIndex = messages.value.findIndex(m => m.id === activeTempGraphSlotId.value);
                if (oldSlotIndex > -1) messages.value.splice(oldSlotIndex, 1);
                activeTempGraphSlotId.value = null;
            }
            const newTempGraphSlotId = 'graph-slot-' + Date.now();
            addOrUpdateMessage('system', '', newTempGraphSlotId, false, false, '', false, true);
            activeTempGraphSlotId.value = newTempGraphSlotId;
            const duration = functionName === 'list_data' ? GRAPH_DISPLAY_DURATION + 2000 : GRAPH_DISPLAY_DURATION;
            setTimeout(() => {
                if (activeTempGraphSlotId.value === newTempGraphSlotId) {
                    const index = messages.value.findIndex(m => m.id === newTempGraphSlotId);
                    if (index > -1) messages.value.splice(index, 1);
                    activeTempGraphSlotId.value = null;
                    if (functionName === 'list_data') visGraphManager.resetZoom();
                }
            }, duration);
        }
        return result;
    };
    
    // --- Core Vue App Logic (No changes from here down) ---
    const autoGrowTextarea=(ev)=>{const el=ev.target;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,128)}px`;};
    const scrollToBottom=(force=false)=>{nextTick(()=>{if(chatContainerRef.value){const{scrollTop,scrollHeight,clientHeight}=chatContainerRef.value;if(force||scrollHeight-scrollTop-clientHeight<150)chatContainerRef.value.scrollTop=scrollHeight;}});};
    const addOrUpdateMessage=(role,text,id=null,stream=false,err=false,origMd=null,sysTool=false,graphSlot=false)=>{const exIdx=id?messages.value.findIndex(m=>m.id===id):-1;const msgData={id:id||Date.now().toString(36)+Math.random().toString(36).substring(2),role:role,parts:[{text:text}],originalMarkdown:origMd!==null?origMd:text,isStreaming:stream,isError:err,isSystemToolResponse:sysTool,isGraphDisplaySlot:graphSlot,timestamp:Date.now()};if(exIdx>-1)messages.value.splice(exIdx,1,msgData);else messages.value.push(msgData);scrollToBottom(role!=='model'||sysTool||graphSlot);return msgData.id;};
    const handleSendMessage=async()=>{const txt=newMessageText.value.trim();if(!txt&&!editingMessage.value)return;isLoading.value=true;const ta=document.getElementById('-input');if(editingMessage.value){const idx=messages.value.findIndex(m=>m.id===editingMessage.value.id);if(idx>-1){messages.value[idx].parts[0].text=txt;messages.value[idx].originalMarkdown=txt;}editingMessage.value=null;isLoading.value=false;}else{addOrUpdateMessage('user',txt,null,false,false,txt);const hist=messages.value.filter(m=>!m.isError&&!m.isSystemToolResponse&&!m.isGraphDisplaySlot).map(m=>{const parts=m.role==='tool'?m.parts:m.parts.map(p=>({text:p.text}));return{role:m.role,parts:parts};});await fetchBotResponse(hist);}newMessageText.value='';if(ta)ta.style.height='auto';if(!editingMessage.value&&ta)ta.focus();};
    
    const fetchBotResponse=async(chatHist)=>{
        const botMsgId=addOrUpdateMessage('model','',null,true);
        isLoading.value=true;
        
        // --- NEW: Add current date to the system prompt for context ---
        const currentDate = new Date().toISOString().slice(0, 10); // Gets date in YYYY-MM-DD format
        const dynamicSystemPrompt = `${SYSTEM_PROMPT}\n\n# Current Context\n- The current date is: ${currentDate}.`;
        
        const payload = {
            contents: chatHist,
            tools: geminiTools,
            systemInstruction: { parts: [{ text: dynamicSystemPrompt }] }
        };

        try{const resp=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const msgIdx=messages.value.findIndex(m=>m.id===botMsgId);if(msgIdx===-1){isLoading.value=false;return;}if(!resp.ok){const errData=await resp.json().catch(()=>({error:{message:"API error"}}));const errMsg=errData.error?.message||`Err: ${resp.status}`;messages.value[msgIdx].parts[0].text=`<p>API Error:</p><p>${errMsg.replace(/\n/g,'<br>')}</p>`;messages.value[msgIdx].isError=true;messages.value[msgIdx].isStreaming=false;isLoading.value=false;return;}const data=await resp.json();if(!data.candidates||!data.candidates[0]||!data.candidates[0].content||!data.candidates[0].content.parts){messages.value[msgIdx].parts[0].text=`<p>Error:</p><p>Invalid AI response.</p>`;messages.value[msgIdx].isError=true;messages.value[msgIdx].isStreaming=false;isLoading.value=false;return;}const parts=data.candidates[0].content.parts;let textResp="",funcCalls=[];for(const p of parts){if(p.text)textResp+=p.text;else if(p.functionCall)funcCalls.push(p.functionCall);}if(funcCalls.length>0){messages.value[msgIdx].isStreaming=false;const callNames=funcCalls.map(c=>c.name).join(', ');messages.value[msgIdx].parts[0].text=`O$: Executing ${callNames}...`;messages.value[msgIdx].originalMarkdown=`[Executing: ${callNames}]`;const toolResponses=[];for(const funcCall of funcCalls){const funcRes=await handleToolCall(funcCall.name,funcCall.args);addOrUpdateMessage('system',`<b>[${funcCall.name}]:</b> ${funcRes.message?.replace(/\n/g,'<br>') || 'Completed.'}`,null,false,!funcRes.success,`[Res: ${funcRes.message || 'Completed.'}]`,true);let modelContent=funcRes;if(funcRes.success&&funcRes.data){modelContent=funcRes.data;}toolResponses.push({functionResponse:{name:funcCall.name,response:{name:funcCall.name,content:modelContent}}});}const newHist=[...chatHist,{role:'model',parts:funcCalls.map(fc=>({functionCall:fc}))},{role:'tool',parts:toolResponses}];await fetchBotResponse(newHist);}else if(textResp.trim()!==""){messages.value[msgIdx].originalMarkdown=textResp;let curTxt="",charIdx=0;const streamInt=setInterval(()=>{if(charIdx<textResp.length){curTxt+=textResp[charIdx++];messages.value[msgIdx].parts[0].text=curTxt;scrollToBottom();}else{clearInterval(streamInt);messages.value[msgIdx].parts[0].text=textResp;messages.value[msgIdx].isStreaming=false;scrollToBottom(true);isLoading.value=false;}},15);}else if(data.candidates[0].finishReason==="SAFETY"||data.promptFeedback?.blockReason){const reason=data.promptFeedback?.blockReason||"Safety";messages.value[msgIdx].parts[0].text=`<p>Blocked:</p><p>Reason: ${reason}.</p>`;messages.value[msgIdx].isError=true;messages.value[msgIdx].isStreaming=false;isLoading.value=false;}else{messages.value[msgIdx].parts[0].text=``;messages.value[msgIdx].isStreaming=false;isLoading.value=false;}}catch(err){console.error('Fetch Error:',err);const mIdx=messages.value.findIndex(m=>m.id===botMsgId);if(mIdx>-1){messages.value[mIdx].parts[0].text=`<p>Error:</p><p>${err.message}</p>`;messages.value[mIdx].isError=true;messages.value[mIdx].isStreaming=false;}isLoading.value=false;}finally{const fIdx=messages.value.findIndex(m=>m.id===botMsgId);if(fIdx>-1&&messages.value[fIdx].isStreaming){if(messages.value[fIdx].parts[0].text===''&&!messages.value[fIdx].isError)messages.value[fIdx].parts[0].text='<p>[Stream Error]</p>';messages.value[fIdx].isStreaming=false;}if(!messages.value.some(m=>m.isStreaming&&m.role==='model'))isLoading.value=false;scrollToBottom(true);}};
    const startEdit=(msg)=>{editingMessage.value=msg;newMessageText.value=msg.originalMarkdown;const ta=document.getElementById('-input');if(ta){ta.focus();nextTick(()=>autoGrowTextarea({target:ta}));}};
    const performCopy=(msg)=>{const txt=msg.originalMarkdown||msg.parts[0].text;navigator.clipboard.writeText(txt.trim()).then(()=>{const el=document.querySelector(`[data-message-id="${msg.id}"]`);if(el){const btn=el.querySelector('.copy-button');if(btn){const origSVG=btn.innerHTML;btn.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-green-500"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>';setTimeout(()=>{btn.innerHTML=origSVG;},1500);}}}).catch(err=>console.error('Copy fail:',err));};
    
    onMounted(() => {
        visGraphManager.init();
        if (visGraphManager.nodes.get().length > 0) {
            addOrUpdateMessage('system', "System O: Active session restored. Data store state loaded.", null, false, false, "", true);
            const initialGraphSlotId = 'graph-slot-initial-load-' + Date.now();
            addOrUpdateMessage('system', '', initialGraphSlotId, false, false, '', false, true);
            activeTempGraphSlotId.value = initialGraphSlotId;
            setTimeout(() => {
                if (activeTempGraphSlotId.value === initialGraphSlotId) {
                    const index = messages.value.findIndex(m => m.id === initialGraphSlotId);
                    if (index > -1) messages.value.splice(index, 1);
                    activeTempGraphSlotId.value = null;
                }
            }, 5000);
        }
        
        const darkModeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'class') {
                    visGraphManager.updateTheme();
                }
            }
        });
        darkModeObserver.observe(document.documentElement, { attributes: true });

        onUnmounted(() => {
            darkModeObserver.disconnect();
            visGraphManager.destroyVisualization();
        });

        const welcomeMessage = `👋`
        addOrUpdateMessage('model', welcomeMessage, null, false, false, welcomeMessage);
    });

    return { messages, newMessageText, isLoading, handleSendMessage, startEdit, performCopy, chatContainerRef, editingMessage, autoGrowTextarea };
  }
}).mount('#app');