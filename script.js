import { createApp, ref, nextTick, watch, onMounted, onUnmounted, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

const API_KEY = "AIzaSyCvtMPDKK4oT_-1RB0MBOYoDwPjme6akoY"; // !!! REPLACE WITH YOUR ACTUAL GEMINI API KEY !!!
const MODEL_NAME = "gemini-2.5-flash-lite-preview-06-17";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

// --- vis.js Graph Manager ---
const visGraphManager = {
    network: null,
    nodes: new vis.DataSet(),
    edges: new vis.DataSet(),
    activeContainerElement: null,
    selectionCallback: null,
    localStorageKey: 'visGraphChatUIData_v2',
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
                navigationButtons: false // MODIFICATION: Changed from true to false
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
        if (!id || typeof id !== 'string' || id.trim() === "") return { success: false, message: "ID is empty." };
        id = id.trim();
        if (this.nodes.get(id)) return { success: false, message: `Note "${id}" already exists.` };
        this.nodes.add({ id: id, label: id, body: body || "", title: body || " " });
        this.saveToLocalStorage();
        this.zoomToFitAllNodes();
        return { success: true, message: `Note "${id}" created.` };
    },
    editNode(currentId, newIdParam, newBodyParam) {
        currentId = currentId ? currentId.trim() : null;
        const newId = newIdParam ? newIdParam.trim() : null;
        if (!currentId) return { success: false, message: "Current node ID is required." };
        const node = this.nodes.get(currentId);
        if (!node) return { success: false, message: `Node "${currentId}" not found.` };
        const idChanged = newId && newId !== currentId;
        if (idChanged && this.nodes.get(newId)) return { success: false, message: `Cannot rename to "${newId}": ID already exists.` };
        let bodyChanged = typeof newBodyParam === 'string' && node.body !== newBodyParam;
        if (!idChanged && !bodyChanged) return { success: true, message: `Node "${currentId}" was not changed.` };
        
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
        let message = `Node "${currentId}" updated.`;
        if(idChanged) message += ` Renamed to "${newId}".`;
        if(bodyChanged) message += ` Body updated.`;
        return { success: true, message };
    },
    addLink(srcId, tgtId) {
        if (!srcId || !tgtId) return { success: false, message: "Source and target IDs are required." };
        srcId = srcId.trim(); tgtId = tgtId.trim();
        if (srcId === tgtId) return { success: false, message: "Cannot link a note to itself." };
        if (!this.nodes.get(srcId)) return { success: false, message: `Source note "${srcId}" not found.` };
        if (!this.nodes.get(tgtId)) return { success: false, message: `Target note "${tgtId}" not found.` };
        if (this.edges.get({ filter: e => (e.from === srcId && e.to === tgtId) || (e.from === tgtId && e.to === srcId) }).length > 0) {
            return { success: false, message: "Link already exists." };
        }
        this.edges.add({ from: srcId, to: tgtId });
        this.saveToLocalStorage();
        return { success: true, message: `Linked "${srcId}" to "${tgtId}".` };
    },
    deleteNode(id) {
        id = id.trim();
        if (!this.nodes.get(id)) return { success: false, message: `Note "${id}" not found.` };
        const selectedNodes = this.network ? this.network.getSelectedNodes() : [];
        if (selectedNodes.length > 0 && selectedNodes[0] === id) this.selectionCallback(null);
        this.nodes.remove(id); // vis.js DataSet automatically removes connected edges
        this.saveToLocalStorage();
        return { success: true, message: `Note "${id}" and its connections were deleted.` };
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
        return { success: true, message: "All notes and links have been cleared from the graph." };
    }
};

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
                <button @click="closeNodeCard" class="close-btn" title="Close note details">×</button>
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
    const GRAPH_DISPLAY_DURATION = 70000;
    
    const geminiTools = [{ functionDeclarations: [
        { name:"create_note", description:"Creates a new note with a given ID (title) and an optional body (Markdown).", parameters:{ type:"OBJECT", properties:{ node_id:{type:"STRING",description:"A unique identifier or title for the note."}, node_body:{type:"STRING",description:"Optional Markdown content for the note."} }, required:["node_id"] } },
        { name:"edit_note", description:"Edits an existing note's ID (title) and/or its body content.", parameters: { type: "OBJECT", properties: { node_id: {type: "STRING", description: "The current ID of the note to edit."}, new_node_id: {type: "STRING", description: "Optional. The new ID for the note."}, new_node_body: {type: "STRING", description: "Optional. The new Markdown content for the note's body."} }, required: ["node_id"] } },
        { name:"connect_notes", description:"Connect two notes by their IDs.", parameters:{type:"OBJECT",properties:{source_id:{type:"STRING", description: "ID of the source note."},target_id:{type:"STRING", description: "ID of the target note."}},required:["source_id","target_id"]}},
        { name:"delete_note", description:"Delete a note by its ID.", parameters:{type:"OBJECT",properties:{node_id:{type:"STRING", description: "ID of the note to delete."}},required:["node_id"]}},
        { name:"search_notes", description:"Highlight notes by searching their IDs and content.", parameters:{type:"OBJECT",properties:{query:{type:"STRING", description: "The search term."}},required:["query"]}},
        { name:"clear_graph", description:"Clear all notes and links from the graph.", parameters:{type:"OBJECT",properties:{}}},
        { name:"list_notes", description:"Lists all notes in the graph, returning their IDs and content. Zooms out to show all nodes.", parameters:{type:"OBJECT",properties:{}}}
    ]}];

    const isGraphTool=(name)=>["create_note","edit_note","connect_notes","delete_note","search_notes","clear_graph","list_notes"].includes(name);

    const handleGraphFunctionCall = (functionName, args) => {
        let result;
        switch (functionName) {
            case "create_note": result = visGraphManager.addNode(args.node_id, args.node_body); break;
            case "edit_note": result = visGraphManager.editNode(args.node_id, args.new_node_id, args.new_node_body); break;
            case "connect_notes": result = visGraphManager.addLink(args.source_id, args.target_id); break;
            case "delete_note": result = visGraphManager.deleteNode(args.node_id); break;
            case "search_notes": result = visGraphManager.highlightSearch(args.query); break;
            case "clear_graph": result = visGraphManager.clearGraphData(); break;
            case "list_notes":
                const notes = visGraphManager.nodes.get().map(n => ({ id: n.id, body: n.body }));
                result = { success: true, message: `Found ${notes.length} note(s). Displaying all nodes.`, data: notes };
                if (result.success) visGraphManager.zoomToFitAllNodes();
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
            const duration = functionName === 'list_notes' ? GRAPH_DISPLAY_DURATION + 2000 : GRAPH_DISPLAY_DURATION;
            setTimeout(() => {
                if (activeTempGraphSlotId.value === newTempGraphSlotId) {
                    const index = messages.value.findIndex(m => m.id === newTempGraphSlotId);
                    if (index > -1) messages.value.splice(index, 1);
                    activeTempGraphSlotId.value = null;
                    if (functionName === 'list_notes') visGraphManager.resetZoom();
                }
            }, duration);
        }
        return result;
    };
    
    const autoGrowTextarea=(ev)=>{const el=ev.target;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,128)}px`;};
    const scrollToBottom=(force=false)=>{nextTick(()=>{if(chatContainerRef.value){const{scrollTop,scrollHeight,clientHeight}=chatContainerRef.value;if(force||scrollHeight-scrollTop-clientHeight<150)chatContainerRef.value.scrollTop=scrollHeight;}});};
    const addOrUpdateMessage=(role,text,id=null,stream=false,err=false,origMd=null,sysTool=false,graphSlot=false)=>{const exIdx=id?messages.value.findIndex(m=>m.id===id):-1;const msgData={id:id||Date.now().toString(36)+Math.random().toString(36).substring(2),role:role,parts:[{text:text}],originalMarkdown:origMd!==null?origMd:text,isStreaming:stream,isError:err,isSystemToolResponse:sysTool,isGraphDisplaySlot:graphSlot,timestamp:Date.now()};if(exIdx>-1)messages.value.splice(exIdx,1,msgData);else messages.value.push(msgData);scrollToBottom(role!=='model'||sysTool||graphSlot);return msgData.id;};
    const handleSendMessage=async()=>{const txt=newMessageText.value.trim();if(!txt&&!editingMessage.value)return;isLoading.value=true;const ta=document.getElementById('message-input');if(editingMessage.value){const idx=messages.value.findIndex(m=>m.id===editingMessage.value.id);if(idx>-1){messages.value[idx].parts[0].text=txt;messages.value[idx].originalMarkdown=txt;}editingMessage.value=null;isLoading.value=false;}else{addOrUpdateMessage('user',txt,null,false,false,txt);const hist=messages.value.filter(m=>!m.isError&&!m.isSystemToolResponse&&!m.isGraphDisplaySlot).map(m=>({role:m.role,parts:m.role==='tool'?m.parts:[{text:m.originalMarkdown}]}));await fetchBotResponse(hist);}newMessageText.value='';if(ta)ta.style.height='auto';if(!editingMessage.value&&ta)ta.focus();};
    const fetchBotResponse=async(chatHist)=>{const botMsgId=addOrUpdateMessage('model','',null,true);isLoading.value=true;const payload={contents:chatHist,tools:geminiTools,};try{const resp=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const msgIdx=messages.value.findIndex(m=>m.id===botMsgId);if(msgIdx===-1){isLoading.value=false;return;}if(!resp.ok){const errData=await resp.json().catch(()=>({error:{message:"API error"}}));const errMsg=errData.error?.message||`Err: ${resp.status}`;messages.value[msgIdx].parts[0].text=`<p>API Error:</p><p>${errMsg.replace(/\n/g,'<br>')}</p>`;messages.value[msgIdx].isError=true;messages.value[msgIdx].isStreaming=false;isLoading.value=false;return;}const data=await resp.json();if(!data.candidates||!data.candidates[0]||!data.candidates[0].content||!data.candidates[0].content.parts){messages.value[msgIdx].parts[0].text=`<p>Error:</p><p>Invalid AI response.</p>`;messages.value[msgIdx].isError=true;messages.value[msgIdx].isStreaming=false;isLoading.value=false;return;}const parts=data.candidates[0].content.parts;let textResp="",funcCall=null;for(const p of parts){if(p.text)textResp+=p.text;else if(p.functionCall){funcCall=p.functionCall;break;}}if(funcCall){messages.value[msgIdx].isStreaming=false;messages.value[msgIdx].parts[0].text=`<i>Tool: ${funcCall.name}...</i>`;messages.value[msgIdx].originalMarkdown=`[Tool: ${funcCall.name}]`;const funcRes=handleGraphFunctionCall(funcCall.name,funcCall.args);addOrUpdateMessage('system',`<b>Tool: ${funcCall.name}</b><br/>${funcRes.message.replace(/\n/g,'<br>')}`,null,false,!funcRes.success,`[Res: ${funcRes.message}]`,true);let modelContent=funcRes;if(funcCall.name==='list_notes'&&funcRes.success&&funcRes.data){modelContent=funcRes.data;}const newHist=[...chatHist,{role:'model',parts:[{functionCall:funcCall}]},{role:'tool',parts:[{functionResponse:{name:funcCall.name,response:{name:funcCall.name,content:modelContent}}}]}];await fetchBotResponse(newHist);}else if(textResp.trim()!==""){messages.value[msgIdx].originalMarkdown=textResp;let curTxt="",charIdx=0;const streamInt=setInterval(()=>{if(charIdx<textResp.length){curTxt+=textResp[charIdx++];messages.value[msgIdx].parts[0].text=curTxt;scrollToBottom();}else{clearInterval(streamInt);messages.value[msgIdx].parts[0].text=textResp;messages.value[msgIdx].isStreaming=false;scrollToBottom(true);isLoading.value=false;}},15);}else if(data.candidates[0].finishReason==="SAFETY"||data.promptFeedback?.blockReason){const reason=data.promptFeedback?.blockReason||"Safety";messages.value[msgIdx].parts[0].text=`<p>Blocked:</p><p>Reason: ${reason}.</p>`;messages.value[msgIdx].isError=true;messages.value[msgIdx].isStreaming=false;isLoading.value=false;}else{messages.value[msgIdx].parts[0].text=`<p>Info:</p><p>Empty AI response.</p>`;messages.value[msgIdx].isStreaming=false;isLoading.value=false;}}catch(err){console.error('Fetch Error:',err);const mIdx=messages.value.findIndex(m=>m.id===botMsgId);if(mIdx>-1){messages.value[mIdx].parts[0].text=`<p>Error:</p><p>${err.message}</p>`;messages.value[mIdx].isError=true;messages.value[mIdx].isStreaming=false;}isLoading.value=false;}finally{const fIdx=messages.value.findIndex(m=>m.id===botMsgId);if(fIdx>-1&&messages.value[fIdx].isStreaming){if(messages.value[fIdx].parts[0].text===''&&!messages.value[fIdx].isError)messages.value[fIdx].parts[0].text='<p>[Stream Error]</p>';messages.value[fIdx].isStreaming=false;}if(!messages.value.some(m=>m.isStreaming&&m.role==='model'))isLoading.value=false;scrollToBottom(true);}};
    const startEdit=(msg)=>{editingMessage.value=msg;newMessageText.value=msg.originalMarkdown;const ta=document.getElementById('message-input');if(ta){ta.focus();nextTick(()=>autoGrowTextarea({target:ta}));}};
    const performCopy=(msg)=>{const txt=msg.originalMarkdown||msg.parts[0].text;navigator.clipboard.writeText(txt.trim()).then(()=>{const el=document.querySelector(`[data-message-id="${msg.id}"]`);if(el){const btn=el.querySelector('.copy-button');if(btn){const origSVG=btn.innerHTML;btn.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-green-500"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>';setTimeout(()=>{btn.innerHTML=origSVG;},1500);}}}).catch(err=>console.error('Copy fail:',err));};
    
    onMounted(() => {
        visGraphManager.init();
        if (visGraphManager.nodes.length > 0) {
            addOrUpdateMessage('system', "Loaded existing graph from previous session.", null, false, false, "", true);
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

        const welcomeMessage = "Hello! I've been updated to use the Vis.js library for graph visualization. You can still create, edit, link, search, and delete notes. Try 'List notes' or 'Create a note about Vis.js'."
        addOrUpdateMessage('model', welcomeMessage, null, false, false, welcomeMessage);
    });

    return { messages, newMessageText, isLoading, handleSendMessage, startEdit, performCopy, chatContainerRef, editingMessage, autoGrowTextarea };
  }
}).mount('#app');
