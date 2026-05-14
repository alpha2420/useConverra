"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type NodeType = 'TRIGGER' | 'ACTION' | 'CONDITION';

interface FlowNode {
    id: string;
    type: NodeType;
    title: string;
    description: string;
    config: any;
}

export default function WorkflowBuilder() {
    const [workflowName, setWorkflowName] = useState("Expense Tracking Workflow");
    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [nodes, setNodes] = useState<FlowNode[]>([
        {
            id: 'node-1',
            type: 'TRIGGER',
            title: 'Event Triggered',
            description: 'When does this workflow start?',
            config: { event: 'IMAGE_UPLOAD' }
        }
    ]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Fetch existing workflows on load
        fetch('/api/workflows')
            .then(res => res.json())
            .then(data => {
                if (data && data.length > 0) {
                    const existing = data[0]; // Load the most recent one for now
                    setWorkflowId(existing._id);
                    setWorkflowName(existing.name);
                    if (existing.nodes && existing.nodes.length > 0) {
                        setNodes(existing.nodes);
                    }
                }
            })
            .catch(err => console.error("Failed to load workflows:", err));
    }, []);

    const addNode = (type: NodeType) => {
        const newNode: FlowNode = {
            id: `node-${Date.now()}`,
            type,
            title: type === 'ACTION' ? 'Execute Action' : 'AI Decision Node',
            description: type === 'ACTION' ? 'Connect to your apps or CRM' : 'Filter using Plain English',
            config: {}
        };
        setNodes([...nodes, newNode]);
    };

    const updateNodeConfig = (id: string, newConfig: any) => {
        setNodes(nodes.map(n => n.id === id ? { ...n, config: { ...n.config, ...newConfig } } : n));
    };

    const deleteNode = (id: string) => {
        if (nodes.length <= 1) return;
        setNodes(nodes.filter(n => n.id !== id));
    };

    // Removed duplicate workflowId declaration

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const triggerNode = nodes.find(n => n.type === 'TRIGGER');
            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    _id: workflowId,
                    name: workflowName,
                    triggerEvent: triggerNode?.config?.event || 'WHATSAPP_MESSAGE',
                    nodes: nodes,
                    isActive: true
                })
            });

            if (!res.ok) throw new Error("Failed to save workflow");
            const data = await res.json();
            if (data._id) setWorkflowId(data._id);
            
            alert("Workflow saved successfully!");
        } catch (error) {
            console.error(error);
            alert("Error saving workflow.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAFAFA] text-[#111827] overflow-x-hidden pb-32">
            {/* Background elements to match Landing Page */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-grid opacity-30"></div>
                <div className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full opacity-40 blur-[80px]" style={{background: 'radial-gradient(circle, #e5e7eb, transparent 70%)', animation: 'orbit1 15s ease-in-out infinite'}}></div>
                <div className="absolute top-1/2 right-[-10%] w-[600px] h-[600px] rounded-full opacity-30 blur-[100px]" style={{background: 'radial-gradient(circle, #d1d5db, transparent 70%)'}}></div>
            </div>

            <div className="relative z-10 max-w-[900px] mx-auto px-6 pt-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-gray-100 text-gray-600 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-gray-200">Converra Automations</span>
                        </div>
                        <h1 className="text-[40px] font-extrabold tracking-[-0.03em] text-gray-900 leading-tight">
                            Flow Builder
                        </h1>
                        <p className="text-[16px] text-gray-500 font-medium mt-1">Design your AI operations layer visually.</p>
                    </div>
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-[#111827] hover:bg-[#374151] text-white px-8 py-3.5 rounded-xl font-semibold text-[15px] transition-all duration-200 shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? "Saving..." : "Publish Workflow"}
                        {!isSaving && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>}
                    </button>
                </div>

                {/* Workflow Name */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-16">
                    <label className="block text-[12px] uppercase tracking-wider font-bold text-gray-400 mb-2">Workflow Title</label>
                    <input 
                        type="text" 
                        value={workflowName}
                        onChange={(e) => setWorkflowName(e.target.value)}
                        className="w-full text-3xl font-extrabold tracking-tight text-gray-900 bg-transparent outline-none focus:text-black transition-colors"
                        placeholder="Name your workflow..."
                    />
                </div>

                {/* The Linear Flow */}
                <div className="relative flex flex-col items-center w-full">
                    <AnimatePresence>
                        {nodes.map((node, index) => (
                            <React.Fragment key={node.id}>
                                <motion.div 
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="w-full max-w-2xl relative z-10"
                                >
                                    <div className="bg-white rounded-[24px] shadow-lg shadow-gray-200/50 border border-gray-200 overflow-hidden group">
                                        {/* Card Header */}
                                        <div className={`px-6 py-4 flex items-center justify-between border-b ${
                                            node.type === 'TRIGGER' ? 'bg-gradient-to-r from-gray-50 to-white border-gray-100' : 
                                            node.type === 'CONDITION' ? 'bg-gradient-to-r from-orange-50/50 to-white border-orange-100/50' : 
                                            'bg-gradient-to-r from-blue-50/50 to-white border-blue-100/50'
                                        }`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center font-bold text-[15px] shadow-sm ${
                                                    node.type === 'TRIGGER' ? 'bg-gray-900 text-white' : 
                                                    node.type === 'CONDITION' ? 'bg-orange-100 text-orange-600 border border-orange-200' : 
                                                    'bg-blue-100 text-blue-600 border border-blue-200'
                                                }`}>
                                                    {node.type === 'TRIGGER' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
                                                    {node.type === 'CONDITION' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
                                                    {node.type === 'ACTION' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>}
                                                </div>
                                                <div>
                                                    <h3 className="font-extrabold text-[15px] tracking-tight text-gray-900">{node.type}</h3>
                                                    <p className="text-[12px] font-medium text-gray-500">{node.title}</p>
                                                </div>
                                            </div>
                                            {node.type !== 'TRIGGER' && (
                                                <button onClick={() => deleteNode(node.id)} className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-6">
                                            {node.type === 'TRIGGER' && (
                                                <div>
                                                    <select 
                                                        value={node.config.event || ''}
                                                        onChange={(e) => updateNodeConfig(node.id, { event: e.target.value })}
                                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-gray-900 outline-none transition-all cursor-pointer appearance-none"
                                                    >
                                                        <option value="WHATSAPP_MESSAGE">Text Message Received</option>
                                                        <option value="IMAGE_UPLOAD">Image/Photo Uploaded</option>
                                                        <option value="VOICE_NOTE">Voice Note Received</option>
                                                        <option value="PDF_UPLOAD">Document Uploaded</option>
                                                    </select>
                                                </div>
                                            )}

                                            {node.type === 'CONDITION' && (
                                                <div>
                                                    <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-1 shadow-inner">
                                                        <textarea 
                                                            placeholder='Type a rule... e.g., "Only if the image looks like a restaurant receipt"'
                                                            value={node.config.rule || ''}
                                                            onChange={(e) => updateNodeConfig(node.id, { rule: e.target.value })}
                                                            className="w-full h-24 rounded-lg bg-transparent px-4 py-3 text-[15px] focus:ring-0 outline-none resize-none font-medium text-gray-900 placeholder-gray-400"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {node.type === 'ACTION' && (
                                                <div>
                                                    <select 
                                                        value={node.config.tool || ''}
                                                        onChange={(e) => updateNodeConfig(node.id, { tool: e.target.value })}
                                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer appearance-none"
                                                    >
                                                        <option value="" disabled>Select a system action...</option>
                                                        <option value="CRMTool">Update Stage in CRM</option>
                                                        <option value="GoogleSheetsTool">Append Row to Google Sheets</option>
                                                        <option value="VisitTool">Schedule an Appointment</option>
                                                        <option value="SlackTool">Send Slack Notification</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Connecting Line */}
                                <div className="h-12 w-0.5 bg-gradient-to-b from-gray-300 to-gray-200 relative z-0"></div>
                            </React.Fragment>
                        ))}
                    </AnimatePresence>

                    {/* Add Node Buttons */}
                    <div className="flex items-center gap-3 relative z-10 p-2 bg-white rounded-2xl shadow-sm border border-gray-200">
                        <button 
                            onClick={() => addNode('CONDITION')}
                            className="px-5 py-2.5 bg-transparent hover:bg-orange-50 text-gray-700 hover:text-orange-600 text-[13px] font-bold rounded-xl transition-all flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            Add AI Condition
                        </button>
                        <div className="w-px h-6 bg-gray-200"></div>
                        <button 
                            onClick={() => addNode('ACTION')}
                            className="px-5 py-2.5 bg-transparent hover:bg-blue-50 text-gray-700 hover:text-blue-600 text-[13px] font-bold rounded-xl transition-all flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            Add Action
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
