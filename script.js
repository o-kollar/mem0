import { createApp, ref, nextTick, watch, onMounted, onUpdated, onBeforeUnmount, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

const API_KEY = "AIzaSyCvtMPDKK4oT_-1RB0MBOYoDwPjme6akoY"; // !!! REPLACE WITH YOUR ACTUAL GEMINI API KEY !!!
const MODEL_NAME = "gemini-2.5-flash-lite-preview-06-17";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

const d3GraphManager = {
    svg: null, simulation: null, graph: { nodes: [], links: [] },
    // --- NEW PROPERTIES ---
    zoomableGroup: null, // A <g> element to wrap all visual elements for zooming
    isZoomedToFit: false, // State to track if we are in the "zoomed-out" overview mode
    // --- END NEW ---
    noteWidth: 120, noteHeight: 70, activeContainerElement: null, resizeObserver: null,
    localStorageKey: 'd3GraphChatUIData',
    isDarkMode: () => document.documentElement.classList.contains('dark'),
    selectedNodeId: null,
    selectionCallback: null,
    previousCenterTargetId: null,

    loadFromLocalStorage() {
        try {
            const storedData = localStorage.getItem(this.localStorageKey);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (parsedData && Array.isArray(parsedData.nodes) && Array.isArray(parsedData.links)) {
                    this.graph = parsedData;
                    console.log("Graph data loaded from localStorage.");
                    return true;
                } else {
                    console.warn("Invalid graph data structure in localStorage.");
                    this.graph = { nodes: [], links: [] };
                }
            }
        } catch (error) {
            console.error("Error loading graph data from localStorage:", error);
            this.graph = { nodes: [], links: [] };
        }
        return false;
    },
    saveToLocalStorage() {
        try { localStorage.setItem(this.localStorageKey, JSON.stringify(this.graph)); }
        catch (error) { console.error("Error saving graph data to localStorage:", error); }
    },
    init() {
        this.loadFromLocalStorage();
        this.selectedNodeId = null; 
        this.previousCenterTargetId = null;
        this.isZoomedToFit = false; // Reset state on init
    },
    getCenterTargetNode() {
        if (this.selectedNodeId) {
            const selectedNode = this.graph.nodes.find(n => n.id === this.selectedNodeId);
            if (selectedNode) return selectedNode;
        }
        const highlightedNodes = this.graph.nodes.filter(n => n.isHighlighted);
        if (highlightedNodes.length === 1) {
            return highlightedNodes[0];
        }
        return null;
    },
    updateCenterForce() {
        if (!this.simulation || !this.activeContainerElement || this.isZoomedToFit) return; // Don't fight the zoom-to-fit

        const newTargetNode = this.getCenterTargetNode();
        const width = this.activeContainerElement.clientWidth || 600;
        const height = this.activeContainerElement.clientHeight || 350;

        if (this.previousCenterTargetId) {
            const oldTarget = this.graph.nodes.find(n => n.id === this.previousCenterTargetId);
            if (oldTarget && (!newTargetNode || oldTarget.id !== newTargetNode.id)) {
                oldTarget.fx = null;
                oldTarget.fy = null;
            }
        }

        if (newTargetNode) {
            newTargetNode.fx = width / 2;
            newTargetNode.fy = height / 2;
            this.previousCenterTargetId = newTargetNode.id;
        } else {
             if (this.previousCenterTargetId) {
                const oldTarget = this.graph.nodes.find(n => n.id === this.previousCenterTargetId);
                if (oldTarget) {
                    oldTarget.fx = null;
                    oldTarget.fy = null;
                }
            }
            this.previousCenterTargetId = null;
        }
        
        this.simulation.force("center", d3.forceCenter(width / 2, height / 2));
        
        if (this.simulation.alpha() < 0.1) {
             this.simulation.alpha(0.3).restart();
        }
    },
    ensureInitialized(containerElement, selectionCallback) {
        if (!containerElement) { console.error("D3: Provided container element is null or undefined."); return; }
        this.selectionCallback = selectionCallback; 

        if (this.activeContainerElement === containerElement && this.svg) {
            const newWidth = containerElement.clientWidth; const newHeight = containerElement.clientHeight;
            if (newWidth > 0 && newHeight > 0) {
                const currentViewBox = this.svg.attr("viewBox")?.split(" ").map(Number);
                 if (!currentViewBox || currentViewBox[2] !== newWidth || currentViewBox[3] !== newHeight) {
                    this.svg.attr("viewBox", `0 0 ${newWidth} ${newHeight}`);
                    if (this.isZoomedToFit) { this.zoomToFitAllNodes(); } // Re-apply zoom on resize
                    else { this.updateCenterForce(); }
                    if (this.simulation) { this.simulation.alpha(0.3).restart(); }
                }
            }
            return;
        }

        this.destroyVisualization(); 
        this.activeContainerElement = containerElement;
        this.selectionCallback = selectionCallback; 

        const width = containerElement.clientWidth || 600; const height = containerElement.clientHeight || 350;
        this.svg = d3.select(containerElement).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet")
            .on("click", (event) => { 
                if (event.target === this.svg.node()) {
                    this.setSelectedNode(null);
                }
            });

        // --- MODIFICATION: Add a zoomable wrapper group ---
        this.zoomableGroup = this.svg.append("g").attr("class", "zoom-wrapper");
        // --- END MODIFICATION ---

        this.simulation = d3.forceSimulation(this.graph.nodes)
            .force("link", d3.forceLink(this.graph.links).id(d => d.id).distance(150))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2)) 
            .on("tick", this.ticked.bind(this));

        // --- MODIFICATION: Append elements to the zoomable group ---
        this.zoomableGroup.append("g").attr("class", "links"); 
        this.zoomableGroup.append("g").attr("class", "notes"); 
        this.zoomableGroup.append("g").attr("class", "labels");
        // --- END MODIFICATION ---
        
        let resizeTimer;
        const handleResize = () => { 
            if (!this.activeContainerElement || !this.svg || !this.simulation) return;
            const newWidth = this.activeContainerElement.clientWidth; const newHeight = this.activeContainerElement.clientHeight;
            if (newWidth > 0 && newHeight > 0) {
                this.svg.attr("viewBox", `0 0 ${newWidth} ${newHeight}`);
                if (this.isZoomedToFit) { this.zoomToFitAllNodes(0); } // Re-apply zoom instantly on resize
                else { this.updateCenterForce(); }
                this.simulation.alpha(0.3).restart();
            } else { 
                this.svg.attr("viewBox", `0 0 600 350`); 
                this.simulation.force("center", d3.forceCenter(300, 175)).alpha(0.3).restart(); 
            }
        };
        const debouncedResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(handleResize, 150); };
        this.resizeObserver = new ResizeObserver(debouncedResize); this.resizeObserver.observe(containerElement);
        if (width > 0 && height > 0) { 
            this.updateCenterForce(); 
            if (this.simulation) this.simulation.alpha(0.3).restart();
        }
        this.update();
    },
    destroyVisualization() {
        if (this.resizeObserver && this.activeContainerElement) { this.resizeObserver.unobserve(this.activeContainerElement); this.resizeObserver.disconnect(); this.resizeObserver = null; }
        if (this.svg) { this.svg.remove(); this.svg = null; }
        if (this.simulation) { this.simulation.stop(); this.simulation = null; }
        this.activeContainerElement = null;
        this.selectionCallback = null; 
        this.selectedNodeId = null;
        this.previousCenterTargetId = null;
        this.zoomableGroup = null; // --- NEW: Cleanup
        this.isZoomedToFit = false; // --- NEW: Cleanup
    },
    ticked() {
        if (!this.svg || !this.simulation) return;
        // --- MODIFICATION: Select within the zoomable group ---
        this.zoomableGroup.selectAll("g.links line").attr("x1", d=>d.source.x).attr("y1", d=>d.source.y).attr("x2", d=>d.target.x).attr("y2", d=>d.target.y);
        this.zoomableGroup.selectAll("g.notes rect").attr("x", d=>d.x-this.noteWidth/2).attr("y", d=>d.y-this.noteHeight/2);
        this.zoomableGroup.selectAll("g.labels text").attr("x", d=>d.x).attr("y", d=>d.y);
        // --- END MODIFICATION ---
    },
    // --- NEW METHOD ---
    resetZoom(duration = 750) {
        if (this.zoomableGroup) {
            this.isZoomedToFit = false;
            this.zoomableGroup.transition().duration(duration)
                .attr("transform", "translate(0,0) scale(1)");
        }
    },
    // --- NEW METHOD ---
    zoomToFitAllNodes(duration = 750) {
        if (!this.zoomableGroup || !this.activeContainerElement || this.graph.nodes.length === 0) {
            this.resetZoom(duration);
            return;
        }

        const width = this.activeContainerElement.clientWidth;
        const height = this.activeContainerElement.clientHeight;

        // Find the bounds of the data
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        this.graph.nodes.forEach(d => {
            if (d.x < x0) x0 = d.x;
            if (d.x > x1) x1 = d.x;
            if (d.y < y0) y0 = d.y;
            if (d.y > y1) y1 = d.y;
        });
        
        // If nodes haven't been positioned yet, we can't calculate bounds. Just reset.
        if (x0 === Infinity) {
            this.resetZoom(duration);
            return;
        }

        // Expand bounds by note dimensions
        x0 -= this.noteWidth / 2;
        x1 += this.noteWidth / 2;
        y0 -= this.noteHeight / 2;
        y1 += this.noteHeight / 2;

        const boundsWidth = x1 - x0;
        const boundsHeight = y1 - y0;
        const midX = (x0 + x1) / 2;
        const midY = (y0 + y1) / 2;
        
        if (boundsWidth === 0 || boundsHeight === 0) { // Handle single node case
            this.resetZoom(duration);
            return;
        }

        // Calculate scale and translation
        const scale = Math.min(width / boundsWidth, height / boundsHeight) * 0.9; // 0.9 for padding
        const translateX = width / 2 - scale * midX;
        const translateY = height / 2 - scale * midY;

        this.isZoomedToFit = true;
        this.zoomableGroup.transition().duration(duration)
            .attr("transform", `translate(${translateX},${translateY}) scale(${scale})`);
    },
    setSelectedNode(nodeId) {
        // --- MODIFICATION: Reset zoom when a node is selected ---
        if (this.isZoomedToFit) {
            this.resetZoom();
        }
        // --- END MODIFICATION ---

        if (this.selectedNodeId === nodeId && nodeId !== null) { 
            this.selectedNodeId = null; 
        } else {
            this.selectedNodeId = nodeId;
        }

        if (this.selectionCallback) {
            const nodeData = this.selectedNodeId ? this.graph.nodes.find(n => n.id === this.selectedNodeId) : null;
            this.selectionCallback(nodeData);
        }
        this.update(); 
    },
    update() {
        if (!this.svg || !this.simulation || !this.activeContainerElement) return;
        this.simulation.nodes(this.graph.nodes); 
        this.simulation.force("link").links(this.graph.links); 
        
        const defaultFill = this.isDarkMode()?"#334155":"#fefce8"; 
        const defaultStroke = this.isDarkMode()?"#64748b":"#facc15"; 
        const highlightedFill = this.isDarkMode()?"#60a5fa":"#e4e4e7"; // zinc-200
        const highlightedStroke = this.isDarkMode()?"#93c5fd":"#a1a1aa"; // zinc-400
        const selectedStroke = this.isDarkMode()?"#a1a1aa":"#27272a"; // zinc-400 / zinc-800

        // --- MODIFICATION: Select within the zoomable group ---
        const link = this.zoomableGroup.select("g.links").selectAll("line").data(this.graph.links, d=>`${d.source.id||d.source}-${d.target.id||d.target}`);
        link.exit().remove();
        link.enter().append("line").attr("class", "link").style("stroke", this.isDarkMode()?"#6b7280":"#9ca3af");

        const notes = this.zoomableGroup.select("g.notes").selectAll("rect").data(this.graph.nodes, d=>d.id);
        notes.exit().remove();
        notes.enter().append("rect")
            .attr("class", "sticky-note")
            .attr("width", this.noteWidth)
            .attr("height", this.noteHeight)
            .on("click", (event, d) => {
                event.stopPropagation(); 
                this.setSelectedNode(d.id);
            })
            .call(d3.drag().on("start",this.dragStarted.bind(this)).on("drag",this.dragged.bind(this)).on("end",this.dragEnded.bind(this)))
            .merge(notes)
            .style("fill", d => d.isHighlighted ? highlightedFill : defaultFill)
            .style("stroke", d => {
                if (d.id === this.selectedNodeId) return selectedStroke;
                return d.isHighlighted ? highlightedStroke : defaultStroke;
            })
            .style("stroke-width", d => (d.id === this.selectedNodeId) ? 2.5 : 1.5);

        const labels = this.zoomableGroup.select("g.labels").selectAll("text").data(this.graph.nodes, d=>d.id);
        labels.exit().remove();
        labels.enter().append("text").attr("class", "note-label").merge(labels)
            .text(d=>d.id.length>18?d.id.substring(0,15)+"...":d.id).style("fill", this.isDarkMode()?"#f3f4f6":"#1f2937");
        // --- END MODIFICATION ---
        
        if (!this.isZoomedToFit) {
            this.updateCenterForce(); 
        }
        this.simulation.alpha(0.3).restart();
    },
    dragStarted(ev,d){
        // --- MODIFICATION: Reset zoom when user starts dragging ---
        if (this.isZoomedToFit) {
            this.resetZoom();
        }
        // --- END MODIFICATION ---
        if(!ev.active&&this.simulation)this.simulation.alphaTarget(0.3).restart();
        d.fx=d.x;d.fy=d.y;
    },
    dragged(ev,d){d.fx=ev.x;d.fy=ev.y;},
    dragEnded(ev,d){
        if(!ev.active && this.simulation) this.simulation.alphaTarget(0);

        const currentCenterTarget = this.getCenterTargetNode();
        const width = this.activeContainerElement ? (this.activeContainerElement.clientWidth || 600) : 600;
        const height = this.activeContainerElement ? (this.activeContainerElement.clientHeight || 350) : 350;

        if (d === currentCenterTarget) { 
            d.fx = width / 2;  
            d.fy = height / 2;
        } else { 
            d.fx = null;       
            d.fy = null;
        }

        if (this.simulation) {
            this.simulation.alpha(0.3).restart(); 
        }
    },
    addNode(id,body=""){if(!id||typeof id!=='string'||id.trim()==="")return{success:false,message:"ID empty."};id=id.trim();if(!this.graph.nodes.find(n=>n.id===id)){this.graph.nodes.push({id:id,body:body||"",isHighlighted:false});this.update();this.saveToLocalStorage();return{success:true,message:`Note "${id}" created.`};}return{success:false,message:`Note "${id}" exists.`};},
    addLink(srcId,tgtId){if(!srcId||!tgtId)return{success:false,message:"IDs required."};srcId=srcId.trim();tgtId=tgtId.trim();if(srcId===tgtId)return{success:false,message:"Self-link."};const sn=this.graph.nodes.find(n=>n.id===srcId),tn=this.graph.nodes.find(n=>n.id===tgtId);if(!sn)return{success:false,message:`Src "${srcId}" missing.`};if(!tn)return{success:false,message:`Tgt "${tgtId}" missing.`};const le=this.graph.links.find(l=>(l.source.id===srcId&&l.target.id===tgtId)||(l.source.id===tgtId&&l.target.id===srcId));if(!le){this.graph.links.push({source:srcId,target:tgtId});this.update();this.saveToLocalStorage();return{success:true,message:`Linked "${srcId}"-"${tgtId}".`};}return{success:false,message:`Link exists.`};},
    deleteNode(id){
        id=id.trim();
        const ne=this.graph.nodes.find(n=>n.id===id);
        if(!ne)return{success:false,message:`Note "${id}" missing.`};
        this.graph.nodes=this.graph.nodes.filter(n=>n.id!==id);
        this.graph.links=this.graph.links.filter(l=>(l.source.id||l.source)!==id&&(l.target.id||l.target)!==id);
        
        let triggerUpdate = true;
        if (this.selectedNodeId === id) {
            this.setSelectedNode(null); // This already calls update()
            triggerUpdate = false; 
        }
        if (this.previousCenterTargetId === id) { // If the deleted node was the one fixed to center
            this.previousCenterTargetId = null; // Clear it, updateCenterForce will handle general centering
        }

        if(triggerUpdate) this.update();

        this.saveToLocalStorage();
        return{success:true,message:`Note "${id}" deleted.`};
    },
    editNode(currentId, newIdParam, newBodyParam) {
        currentId = currentId ? currentId.trim() : null;
        const newId = newIdParam ? newIdParam.trim() : null;

        if (!currentId) {
            return { success: false, message: "Current node ID is required to edit." };
        }

        const nodeIndex = this.graph.nodes.findIndex(n => n.id === currentId);
        if (nodeIndex === -1) {
            return { success: false, message: `Node "${currentId}" not found.` };
        }
        const node = this.graph.nodes[nodeIndex]; 

        let idChanged = false;
        let bodyChanged = false;
        const originalId = node.id; 

        if (newId && newId !== originalId) {
            if (this.graph.nodes.some(n => n.id === newId)) {
                return { success: false, message: `Cannot rename to "${newId}": ID already exists.` };
            }
            node.id = newId; 
            idChanged = true;

            this.graph.links.forEach(link => {
                if (link.source === originalId) {
                    link.source = newId;
                } else if (typeof link.source === 'object' && link.source.id === originalId) { 
                    link.source.id = newId;
                }
                if (link.target === originalId) {
                    link.target = newId;
                } else if (typeof link.target === 'object' && link.target.id === originalId) { 
                    link.target.id = newId;
                }
            });
            if (this.previousCenterTargetId === originalId) { // If renamed node was centered
                this.previousCenterTargetId = newId;
            }
        }

        if (typeof newBodyParam === 'string') {
            if (node.body !== newBodyParam) {
                node.body = newBodyParam;
                bodyChanged = true;
            }
        }

        if (!idChanged && !bodyChanged) {
            return { success: true, message: `Node "${originalId}" was not changed (no new ID or body provided, or values were the same).` };
        }
        
        let selectionNeedsUpdate = false;
        if (this.selectedNodeId === originalId) {
            if (idChanged) {
                this.selectedNodeId = newId; 
            }
            selectionNeedsUpdate = true;
        } else if (this.selectedNodeId === newId && idChanged) { 
             selectionNeedsUpdate = true;
        }
        
        this.update(); // This will call updateCenterForce
        this.saveToLocalStorage();

        if (selectionNeedsUpdate && this.selectionCallback) {
             const updatedNodeForCallback = this.graph.nodes.find(n => n.id === this.selectedNodeId);
             this.selectionCallback(updatedNodeForCallback);
        }

        let message = `Node "${originalId}" updated.`;
        if (idChanged && newId) message += ` Renamed to "${newId}".`;
        if (bodyChanged) message += ` Body content ${newBodyParam === "" ? "cleared" : "updated"}.`;
        
        return { success: true, message: message.trim() };
    },
    highlightSearch(q){const nq=q?q.trim().toLowerCase():"";this.graph.nodes.forEach(n=>{n.isHighlighted=nq&&(n.id.toLowerCase().includes(nq)||(n.body&&n.body.toLowerCase().includes(nq)))});this.update();return{success:true,message:nq?`Highlight: "${q}".`:"Highlight cleared."};},
    clearGraphData(){
        this.graph.nodes=[];
        this.graph.links=[];
        this.previousCenterTargetId = null; // Clear fixed node tracker
        this.setSelectedNode(null); 
        // this.update(); // setSelectedNode(null) calls update()
        this.saveToLocalStorage();
        return{success:true,message:"Graph data cleared."};
    }
};

const MessageItem = {
  props: ['message'], emits: ['edit', 'copy'],
  setup(props, { emit }) {
    const contentRef = ref(null), parsedContent = ref(''), isUser = props.message.role === 'user';
    const graphHostElement = ref(null), isDarkMode = ref(d3GraphManager.isDarkMode());
    let darkModeObserver = null;

    const selectedRawNode = ref(null);

    const handleNodeSelectionChange = (nodeData) => {
        selectedRawNode.value = nodeData;
    };

    const displayedNodeDetails = computed(() => {
        if (selectedRawNode.value && selectedRawNode.value.body && selectedRawNode.value.body.trim() !== '') {
            return {
                id: selectedRawNode.value.id,
                parsedBody: marked.parse(selectedRawNode.value.body)
            };
        }
        return null;
    });

    const closeNodeCard = () => {
        if (props.message.isGraphDisplaySlot && d3GraphManager.activeContainerElement === graphHostElement.value) {
            d3GraphManager.setSelectedNode(null); 
        }
    };

    const updateContentAndRenderMath = (text) => {
      if (props.message.isGraphDisplaySlot) { parsedContent.value = ''; return; }
      if (props.message.isError) parsedContent.value = text;
      else if (props.message.role === 'model' || props.message.isSystemToolResponse) parsedContent.value = marked.parse(text || (props.message.isStreaming ? ' ' : ''));
      else parsedContent.value = marked.parse(text || '');
      nextTick(() => {
        if (contentRef.value && !props.message.isError && (props.message.role==='model' || (text&&text.includes('$')))) {
          try { if (typeof renderMathInElement === 'function') renderMathInElement(contentRef.value, {delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}], throwOnError: false}); } catch (e) { console.warn("KaTeX:", e); }
        }
        if (props.message.isGraphDisplaySlot && displayedNodeDetails.value && contentRef.value?.querySelector('.node-details-card-body')) {
            // KaTeX for card handled by watch(selectedRawNode)
        }
      });
    };
    watch(() => props.message.parts[0].text, (nt) => { if (!props.message.isGraphDisplaySlot) updateContentAndRenderMath(nt); }, { immediate: true });
    watch(() => props.message.isStreaming, (is,was) => { if (was&&!is&&!props.message.isGraphDisplaySlot) updateContentAndRenderMath(props.message.parts[0].text); });
    
    watch(selectedRawNode, (newNodeData) => {
        if (newNodeData && newNodeData.body && graphHostElement.value) {
            nextTick(() => {
                const cardBody = graphHostElement.value.querySelector('.node-details-card-body');
                if (cardBody && typeof renderMathInElement === 'function' && newNodeData.body.includes('$')) {
                     try { renderMathInElement(cardBody, {delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}], throwOnError: false}); } catch (e) { console.warn("KaTeX in card:", e); }
                }
            });
        }
    }, { deep: true });


    const handleEdit = () => emit('edit', props.message), handleCopy = () => emit('copy', props.message);

    const setupGraphObserver = () => {
        const obs = new MutationObserver((ml) => {
            for (const m of ml) if (m.type === 'attributes' && m.attributeName === 'class') {
                const newIsDark = d3GraphManager.isDarkMode();
                if (isDarkMode.value !== newIsDark) {
                    isDarkMode.value = newIsDark;
                    if (props.message.isGraphDisplaySlot && d3GraphManager.activeContainerElement === graphHostElement.value && d3GraphManager.svg) {
                         d3GraphManager.update();
                    }
                }
            }
        });
        obs.observe(document.documentElement, { attributes: true });
        return obs;
    };
    onMounted(() => {
        if (props.message.isGraphDisplaySlot && graphHostElement.value) {
            d3GraphManager.ensureInitialized(graphHostElement.value, handleNodeSelectionChange);
            darkModeObserver = setupGraphObserver();
        }
    });
    onUpdated(() => { 
        if (props.message.isGraphDisplaySlot && graphHostElement.value) {
            d3GraphManager.ensureInitialized(graphHostElement.value, handleNodeSelectionChange);
            if(!darkModeObserver) darkModeObserver = setupGraphObserver();
        } else if (!props.message.isGraphDisplaySlot && darkModeObserver) {
            darkModeObserver.disconnect(); darkModeObserver = null;
        }
    });
    onBeforeUnmount(() => {
        if (darkModeObserver) { darkModeObserver.disconnect(); darkModeObserver = null; }
        if (props.message.isGraphDisplaySlot && graphHostElement.value && d3GraphManager.activeContainerElement === graphHostElement.value) {
            d3GraphManager.destroyVisualization(); 
             selectedRawNode.value = null; 
        }
    });
    return { isUser, handleEdit, handleCopy, contentRef, parsedContent, message: props.message, graphHostElement, isDarkMode, displayedNodeDetails, closeNodeCard };
  },
  template: `
    <div v-if="message.isGraphDisplaySlot" class="w-full my-3">
        <div ref="graphHostElement" class="graph-host-container" :class="isDarkMode ? 'bg-slate-800' : 'bg-slate-50'">
            <!-- Node Details Card -->
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

    const geminiTools = [{ functionDeclarations: []}];
    geminiTools[0].functionDeclarations = [
        {
            name:"create_note",
            description:"Creates a new note with a given ID (title) and an optional body. The body should be formatted as Markdown.",
            parameters:{
                type:"OBJECT",
                properties:{
                    node_id:{type:"STRING",description:"A unique identifier or title for the note."},
                    node_body:{type:"STRING",description:"The content/details for the note, formatted as Markdown. This field is optional. Provide an empty string to create a note with no body."}
                },
                required:["node_id"]
            }
        },
        {
            name:"edit_note",
            description:"Edits an existing note. Allows changing the note's ID (title) and/or its body content. If the note ID is not found, consider using 'list_notes' to see available notes.",
            parameters: {
                type: "OBJECT",
                properties: {
                    node_id: {type: "STRING", description: "The current ID (title) of the note to be edited."},
                    new_node_id: {type: "STRING", description: "Optional. The new ID (title) for the note. If different from current, the note will be renamed."},
                    new_node_body: {type: "STRING", description: "Optional. The new Markdown content for the note's body. If provided, replaces the existing body. An empty string clears the body."}
                },
                required: ["node_id"]
            }
        },
        {name:"connect_notes",description:"Connect notes by their IDs. If a source or target ID is not found, consider using 'list_notes' to see available notes.",parameters:{type:"OBJECT",properties:{source_id:{type:"STRING", description: "ID of the source note."},target_id:{type:"STRING", description: "ID of the target note."}},required:["source_id","target_id"]}},
        {name:"delete_note",description:"Delete a note by its ID. If the note ID is not found, consider using 'list_notes' to see available notes.",parameters:{type:"OBJECT",properties:{node_id:{type:"STRING", description: "ID of the note to delete."}},required:["node_id"]}},
        {name:"search_notes",description:"Highlight notes based on a query string. The query will search note IDs and their Markdown content.",parameters:{type:"OBJECT",properties:{query:{type:"STRING", description: "The search term."}},required:["query"]}},
        {name:"clear_graph",description:"Clear all notes and links from the graph.",parameters:{type:"OBJECT",properties:{}}},
        {name:"list_notes",description:"Lists all notes currently in the graph, returning their IDs and body content. Use this tool first if you are unsure which note a user is referring to, or if another tool fails to find a note. Triggers a zoom-out animation to show all nodes.",parameters:{type:"OBJECT",properties:{}}}
    ];

    const isGraphTool=(name)=>["create_note","edit_note","connect_notes","delete_note","search_notes","clear_graph","list_notes"].includes(name);

    const handleGraphFunctionCall = (functionName, args) => {
        let result;
        switch (functionName) {
            case "create_note": result = d3GraphManager.addNode(args.node_id, args.node_body); break;
            case "edit_note": result = d3GraphManager.editNode(args.node_id, args.new_node_id, args.new_node_body); break;
            case "connect_notes": result = d3GraphManager.addLink(args.source_id, args.target_id); break;
            case "delete_note": result = d3GraphManager.deleteNode(args.node_id); break;
            case "search_notes": result = d3GraphManager.highlightSearch(args.query); break;
            case "clear_graph": result = d3GraphManager.clearGraphData(); break;
            case "list_notes":
                const notes = d3GraphManager.graph.nodes.map(n => ({ id: n.id, body: n.body }));
                const message = `Found ${notes.length} note(s). Displaying all nodes.`;
                result = { success: true, message: message, data: notes };
                if (result.success) {
                    d3GraphManager.zoomToFitAllNodes();
                }
                break;
            default: result = { success: false, message: `Unknown fn: ${functionName}` };
        }

        if (result.success && isGraphTool(functionName)) {
            if (activeTempGraphSlotId.value) {
                const oldSlotIndex = messages.value.findIndex(m => m.id === activeTempGraphSlotId.value && m.isGraphDisplaySlot);
                if (oldSlotIndex > -1) messages.value.splice(oldSlotIndex, 1);
                activeTempGraphSlotId.value = null;
            }
            const newTempGraphSlotId = 'graph-slot-' + Date.now();
            addOrUpdateMessage('system', '', newTempGraphSlotId, false, false, '', false, true);
            activeTempGraphSlotId.value = newTempGraphSlotId;
            
            const duration = functionName === 'list_notes' ? GRAPH_DISPLAY_DURATION + 2000 : GRAPH_DISPLAY_DURATION;
            setTimeout(() => {
                if (activeTempGraphSlotId.value === newTempGraphSlotId) {
                    const index = messages.value.findIndex(m => m.id === newTempGraphSlotId && m.isGraphDisplaySlot);
                    if (index > -1) messages.value.splice(index, 1);
                    activeTempGraphSlotId.value = null;
                    
                    if (functionName === 'list_notes') {
                        d3GraphManager.resetZoom();
                    }
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
        d3GraphManager.init();
        if (d3GraphManager.graph.nodes.length > 0 || d3GraphManager.graph.links.length > 0) {
            addOrUpdateMessage('system', "Loaded existing graph from previous session.", null, false, false, "[System: Graph Loaded from Storage]", true);
            const initialGraphSlotId = 'graph-slot-initial-load-' + Date.now();
            addOrUpdateMessage('system', '', initialGraphSlotId, false, false, '', false, true);
            activeTempGraphSlotId.value = initialGraphSlotId;
            setTimeout(() => {
                if (activeTempGraphSlotId.value === initialGraphSlotId) {
                    const index = messages.value.findIndex(m => m.id === initialGraphSlotId && m.isGraphDisplaySlot);
                    if (index > -1) messages.value.splice(index, 1);
                    activeTempGraphSlotId.value = null;
                }
            }, GRAPH_DISPLAY_DURATION);
        }
        const welcomeMessage = "Hello! Click a note to see its details. You can create, edit, link, search, and delete notes. Try 'List notes', 'Create note \"My Idea\" with body \"- Point 1\\n- Point 2\"', or 'Edit note \"My Idea\" and change its body to \"Updated content.\"'."
        addOrUpdateMessage('model', welcomeMessage, null, false, false, welcomeMessage);
    });

    return { messages, newMessageText, isLoading, handleSendMessage, startEdit, performCopy, chatContainerRef, editingMessage, autoGrowTextarea };
  }
}).mount('#app');
