'use client'
import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from "motion/react"
import { useRouter } from 'next/navigation'
import axios from 'axios'
import QRCode from 'react-qr-code'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

interface UnansweredQuestion {
    _id: string;
    question: string;
    contactNumber?: string;
    source: "widget" | "whatsapp";
    status: string;
    createdAt: string;
}

function DashboardClient({ ownerId, userName, userEmail }: { ownerId: string, userName?: string, userEmail?: string }) {
    const navigate = useRouter()
    const [businessName, setBusinessName] = useState("")
    const [businessType, setBusinessType] = useState("")
    const [description, setDescription] = useState("")
    const [location, setLocation] = useState("")
    const [workingHours, setWorkingHours] = useState("")
    const [website, setWebsite] = useState("")
    // Services
    const [services, setServices] = useState<{name:string,description:string,price:string,duration:string,availability:string}[]>([])
    const [newService, setNewService] = useState({name:"",description:"",price:"",duration:"",availability:""})
    // Knowledge
    const [knowledge, setKnowledge] = useState("")
    const [faqs, setFaqs] = useState<{question: string, answer: string}[]>([])
    const [newFaqQ, setNewFaqQ] = useState("")
    const [newFaqA, setNewFaqA] = useState("")
    const [policies, setPolicies] = useState({refund:"",cancellation:"",delivery:"",bookingRules:"",returnPolicy:"",general:""})
    // Support Escalation
    const [supportEmail, setSupportEmail] = useState("")
    const [whatsappNumber, setWhatsappNumber] = useState("")
    const [supportNumber, setSupportNumber] = useState("")
    const [emergencyContact, setEmergencyContact] = useState("")
    // Agent / Media / Overrides
    const [agentInstructions, setAgentInstructions] = useState("")
    const [mediaLinks, setMediaLinks] = useState<{name: string, url: string}[]>([])
    const [newLinkName, setNewLinkName] = useState("")
    const [newLinkUrl, setNewLinkUrl] = useState("")
    const [aiOverrides, setAiOverrides] = useState<{topic: string, response: string}[]>([])
    const [newOverrideTopic, setNewOverrideTopic] = useState("")
    const [newOverrideResponse, setNewOverrideResponse] = useState("")

    const [loading, setLoading] = useState(false)
    const [saved, setSaved] = useState(false)
    const [cleaningUp, setCleaningUp] = useState(false)
    const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)

    // Upload state
    const [uploadingPdf, setUploadingPdf] = useState(false)
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
    const [refining, setRefining] = useState(false)
    
    // Test Bot state
    const [testMessage, setTestMessage] = useState("")
    const [chatHistory, setChatHistory] = useState<{role: 'user'|'bot', content: string}[]>([
        { role: 'bot', content: 'Hi! Test your settings here. How can I help you today?' }
    ])
    const [chatLoading, setChatLoading] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatHistory, chatLoading])

    // Unanswered Questions state
    const [unansweredQuestions, setUnansweredQuestions] = useState<UnansweredQuestion[]>([])
    const [uqLoading, setUqLoading] = useState(true)
    const [answeringId, setAnsweringId] = useState<string | null>(null)
    const [answerText, setAnswerText] = useState("")
    const [submittingAnswer, setSubmittingAnswer] = useState(false)
    const [isUqModalOpen, setIsUqModalOpen] = useState(false)
    const [currentStep, setCurrentStep] = useState(1)


    // WhatsApp Integration state
    const [wsStatus, setWsStatus] = useState({ 
        isReady: false, 
        qrCode: null as string | null, 
        disconnecting: false,
        providerStatus: null as any 
    })
    const [wsLoading, setWsLoading] = useState(false)
    const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false)

    const buildSettingsPayload = () => ({
        ownerId,
        businessName, businessType, description,
        location, workingHours, website, services,
        supportEmail, whatsappNumber, supportNumber, emergencyContact,
        knowledge, faqs, policies, agentInstructions, mediaLinks, aiOverrides
    })

    const handleSettings = async (manualData?: any) => {
        setLoading(true)
        try {
            const data = manualData || buildSettingsPayload()
            const result = await axios.post("/api/settings", data)
            console.log(result.data)
            setLoading(false)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            return result.data
        } catch (error) {
            console.log(error)
            setLoading(false)
            throw error
        }
    }

    const deleteMediaLink = async (idx: number) => {
        const updated = mediaLinks.filter((_, i) => i !== idx);
        setMediaLinks(updated);
        await handleSettings({ ...buildSettingsPayload(), mediaLinks: updated });
    };

    const deleteOverride = async (idx: number) => {
        const updated = aiOverrides.filter((_, i) => i !== idx);
        setAiOverrides(updated);
        await handleSettings({ ...buildSettingsPayload(), aiOverrides: updated });
    };

    const resetAllData = async () => {
        if (confirm("⚠️ DANGER: This will permanently delete ALL your chatbot data from the database. Are you sure?")) {
            setBusinessName(""); setBusinessType(""); setDescription("");
            setLocation(""); setWorkingHours(""); setWebsite(""); setServices([]);
            setSupportEmail(""); setWhatsappNumber(""); setSupportNumber(""); setEmergencyContact("");
            setKnowledge(""); setFaqs([]);
            setPolicies({refund:"",cancellation:"",delivery:"",bookingRules:"",returnPolicy:"",general:""});
            setAgentInstructions(""); setMediaLinks([]); setAiOverrides([]);
            await handleSettings({
                ownerId, businessName:"", businessType:"", description:"",
                location:"", workingHours:"", website:"", services:[],
                supportEmail:"", whatsappNumber:"", supportNumber:"", emergencyContact:"",
                knowledge:"", faqs:[],
                policies:{refund:"",cancellation:"",delivery:"",bookingRules:"",returnPolicy:"",general:""},
                agentInstructions:"", mediaLinks:[], aiOverrides:[]
            });
            alert("All data has been deleted from everywhere.");
        }
    };

    useEffect(() => {
        if (ownerId) {
            const handleGetDetails = async () => {
                try {
                    const result = await axios.post("/api/settings/get", { ownerId })
                    if (result.data) {
                        const d = result.data
                        setBusinessName(d.businessName || "")
                        setBusinessType(d.businessType || "")
                        setDescription(d.description || "")
                        setLocation(d.location || "")
                        setWorkingHours(d.workingHours || "")
                        setWebsite(d.website || "")
                        setServices(d.services || [])
                        setSupportEmail(d.supportEmail || "")
                        setWhatsappNumber(d.whatsappNumber || "")
                        setSupportNumber(d.supportNumber || "")
                        setEmergencyContact(d.emergencyContact || "")
                        setKnowledge(d.knowledge || "")
                        setFaqs(d.faqs || [])
                        setPolicies(d.policies || {refund:"",cancellation:"",delivery:"",bookingRules:"",returnPolicy:"",general:""})
                        setAgentInstructions(d.agentInstructions || "")
                        setMediaLinks(d.mediaLinks || [])
                        setAiOverrides(d.aiOverrides || [])
                    }
                } catch (error) {
                    console.log(error)
                }
            }
            handleGetDetails()
            fetchUnansweredQuestions()
            pollWhatsAppStatus()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownerId])

    useEffect(() => {
        if (!ownerId) return;
        
        const interval = setInterval(async () => {
            // Poll when: waiting for QR, or disconnecting (to detect when it's done)
            if (!wsStatus.isReady) {
                await pollWhatsAppStatus();
            }
        }, 5000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownerId, wsStatus.isReady]);

    const pollWhatsAppStatus = async () => {
        try {
            const res = await axios.post("/api/whatsapp/qr", { ownerId });
            setWsStatus(prev => ({
                isReady: res.data.isReady,
                qrCode: res.data.qrCode,
                disconnecting: res.data.disconnecting ?? false,
                providerStatus: res.data.providerStatus
            }));
        } catch (err) {
            console.error("Failed to poll WhatsApp status", err);
        }
    };

    const handleConnectWhatsApp = async () => {
        setWsLoading(true);
        try {
            await axios.post("/api/whatsapp/connect", { ownerId });
            setWsStatus(prev => ({ ...prev, isReady: false, qrCode: null, disconnecting: false }));
        } catch (err) {
            console.error("Failed to connect", err);
        } finally {
            setWsLoading(false);
        }
    };

    const handleDisconnectWhatsApp = async () => {
        setIsDisconnectDialogOpen(false);
        setWsLoading(true);
        try {
            await axios.post("/api/whatsapp/disconnect", { ownerId });
            setWsStatus(prev => ({ ...prev, isReady: false, qrCode: null, disconnecting: true }));
        } catch (err) {
            console.error("Failed to disconnect", err);
        } finally {
            setWsLoading(false);
        }
    };
    const handleLogout = async () => {
        try {
            await axios.post("/api/auth/logout");
            navigate.push("/login");
        } catch (err) {
            console.error("Logout failed", err);
            // Fallback: clear cookies via client side if possible or just redirect
            navigate.push("/login");
        }
    };
    useEffect(() => {
        if (!ownerId) return;
        
        const uqInterval = setInterval(async () => {
            await fetchUnansweredQuestions(true); // Background refresh
        }, 15000); // Every 15 seconds

        return () => clearInterval(uqInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownerId]);

    const fetchUnansweredQuestions = async (isBackground = false) => {
        try {
            if (!isBackground) setUqLoading(true)
            const res = await axios.get(`/api/unanswered-questions?ownerId=${ownerId}`)
            setUnansweredQuestions(res.data)
        } catch (err) {
            console.error("Failed to fetch unanswered questions", err)
        } finally {
            if (!isBackground) setUqLoading(false)
        }
    }

    const handleAnswerQuestion = async (questionId: string) => {
        if (!answerText.trim()) return
        setSubmittingAnswer(true)
        try {
            const res = await axios.post("/api/unanswered-questions/answer", {
                questionId,
                ownerId,
                answer: answerText
            })
            // Update local knowledge from DB response
            if (res.data.updatedKnowledge) {
                setKnowledge(res.data.updatedKnowledge)
            }
            setAnsweringId(null)
            setAnswerText("")
            fetchUnansweredQuestions()
        } catch (err) {
            console.error("Failed to answer question", err)
            alert("Failed to submit answer.")
        } finally {
            setSubmittingAnswer(false)
        }
    }

    const handleDismissQuestion = async (questionId: string) => {
        // Optimistic update — remove from UI immediately regardless of DB state
        setUnansweredQuestions(prev => prev.filter(q => q._id !== questionId))
        try {
            await axios.post("/api/unanswered-questions/delete", { questionId })
        } catch (err) {
            // Silently ignore DB quota errors — item is already removed from UI
            console.warn("Could not delete from DB (possibly full), removed from UI only:", err)
        }
    }

    const handleCleanup = async () => {
        if (!confirm("This will delete old cached responses, usage logs, and trim long conversation histories to free up database storage. Continue?")) return
        setCleaningUp(true)
        setCleanupMsg(null)
        try {
            const res = await axios.post("/api/admin/cleanup", { ownerId })
            setCleanupMsg(res.data.message || "Cleanup complete!")
            setTimeout(() => setCleanupMsg(null), 8000)
        } catch (err: any) {
            const msg = err.response?.data?.message || "Cleanup failed. Try again."
            setCleanupMsg(`❌ ${msg}`)
            setTimeout(() => setCleanupMsg(null), 6000)
        } finally {
            setCleaningUp(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPdf(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await axios.post("/api/upload-pdf", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            if (res.data.text) {
                const pdfContent = `\n\n--- [PDF Content: ${file.name}] ---\n\n${res.data.text}`;
                const updatedKnowledge = knowledge + pdfContent;
                
                // 1. Update the UI textarea
                setKnowledge(updatedKnowledge);

                // 2. Immediately auto-save to trigger RAG chunking pipeline
                setLoading(true);
                await axios.post("/api/settings", {
                    ownerId,
                    businessName,
                    supportEmail,
                    knowledge: updatedKnowledge,
                    whatsappNumber,
                    businessType,
                    description,
                    faqs,
                    policies,
                    mediaLinks
                });
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
                setLoading(false);
                console.log("[PDF] Knowledge auto-saved and RAG chunks indexed.");
            }
        } catch (err) {
            console.error("Failed to parse PDF", err);
            alert("Failed to extract text from PDF document");
            setLoading(false);
        } finally {
            setUploadingPdf(false);
            e.target.value = ''; // Reset input
        }
    }

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingPhoto(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name);

        try {
            const res = await axios.post("/api/upload-photo", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            if (res.data.success && res.data.url) {
                const updatedLinks = [...mediaLinks, { name: file.name, url: res.data.url }];
                setMediaLinks(updatedLinks);
                
                // Auto-save settings
                await handleSettings({ ...buildSettingsPayload(), mediaLinks: updatedLinks });
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            console.error("Failed to upload photo", err);
            alert("Failed to upload photo to Cloudinary");
        } finally {
            setIsUploadingPhoto(false);
            e.target.value = ''; // Reset input
        }
    }

    const handleRefineKnowledge = async () => {
        if (!knowledge.trim() || knowledge.length < 20) return;
        setRefining(true);
        try {
            const res = await axios.post("/api/knowledge/refine", { text: knowledge });
            if (res.data.refinedText) {
                setKnowledge(res.data.refinedText);
            }
        } catch (err: any) {
            console.error("Refinement failed", err);
            const msg = err.response?.data?.message || err.message || "Unknown error";
            alert(`Failed to refine knowledge base: ${msg}`);
        } finally {
            setRefining(false);
        }
    };

    const handleTestChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!testMessage.trim()) return;

        const userMsg = testMessage;
        setTestMessage("");
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
        setChatLoading(true);

        try {
            const res = await axios.post("/api/chat", {
                ownerId,
                history: chatHistory.map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                })),
                message: userMsg
            });
            
            setChatHistory(prev => [...prev, { role: 'bot', content: res.data }]);
        } catch (err) {
            console.error("Chat error", err);
            setChatHistory(prev => [...prev, { role: 'bot', content: "Error reaching AI bot." }]);
        } finally {
            setChatLoading(false);
        }
    }

    const formatTimeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime()
        const minutes = Math.floor(diff / 60000)
        if (minutes < 1) return "just now"
        if (minutes < 60) return `${minutes}m ago`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        return `${days}d ago`
    }

    return (
        <div className='min-h-screen bg-zinc-50 text-zinc-900'>
            <motion.nav
                initial={{ y: -50 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed top-4 w-full z-50 px-4"
            >
                <div className="max-w-[1200px] mx-auto px-6 h-[60px] flex items-center justify-between bg-white/90 backdrop-blur-md border border-gray-200 shadow-sm rounded-2xl relative">
                    
                    {/* Left: Logo */}
                    <div className="font-bold text-lg tracking-tight flex items-center gap-2 text-gray-900 cursor-pointer shrink-0" onClick={() => navigate.push("/")}>
                        <div className="w-5 h-5 bg-gray-900 rounded-[4px] flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        Converra
                    </div>
                    
                    {/* Middle: Navigation Links */}
                    <div className='hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center gap-6 font-semibold text-[13px] text-gray-600 w-max'>
                        <button className='hover:text-black transition' onClick={()=>navigate.push("/dashboard/analytics")}>Insights</button>
                        <button className='hover:text-black transition hidden md:block' onClick={()=>navigate.push("/dashboard/crm/play")}>Play Mode</button>
                        <button className='hover:text-black transition' onClick={()=>navigate.push("/dashboard/crm")}>CRM</button>
                        <button className='hover:text-black transition hidden lg:block' onClick={()=>navigate.push("/dashboard/agent-instructions")}>AI Rules</button>
                        <button className='hover:text-black transition' onClick={()=>navigate.push("/dashboard/corrections")}>AI Learning</button>
                    </div>

                    {/* Right: User Info & Logout */}
                    <div className='flex gap-4 shrink-0 items-center justify-end z-10'>
                        <div className='hidden lg:flex flex-col items-end'>
                            <span className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>Logged in</span>
                            <span className='text-[12px] font-semibold text-gray-900'>{userName || 'User'}</span>
                        </div>
                        
                        <div className='w-px h-5 bg-gray-200 hidden lg:block'></div>
                        
                        <button 
                            onClick={handleLogout}
                            className='text-gray-400 hover:text-red-500 transition-colors'
                            title="Logout"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        </button>
                    </div>

                </div>
            </motion.nav>

            <div className='max-w-7xl mx-auto px-4 mt-24 mb-[-40px]'>
                <AnimatePresence>
                    {(wsStatus.providerStatus?.openai?.error || wsStatus.providerStatus?.gemini?.error) && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3 shadow-sm"
                        >
                            <span className="text-xl"></span>
                            <div>
                                <h3 className="text-sm font-bold text-red-900">AI Provider Alert</h3>
                                <div className="text-xs text-red-700 mt-1 space-y-1">
                                    {wsStatus.providerStatus?.openai?.error && (
                                        <p><strong>OpenAI:</strong> {wsStatus.providerStatus.openai.error}</p>
                                    )}
                                    {wsStatus.providerStatus?.gemini?.error && (
                                        <p><strong>Gemini:</strong> {wsStatus.providerStatus.gemini.error}</p>
                                    )}
                                </div>
                                <p className="text-[10px] text-red-500 mt-2">
                                    Your AI might be temporarily offline. Please check your billing or API settings.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className='max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-[1fr_370px] gap-8 items-start'>
                <div className='space-y-8'>
                    <motion.div
                        className='w-full bg-white rounded-2xl shadow-xl p-8 relative'
                    >
                        <div className='mb-8'>
                            <h1 className='text-2xl font-semibold'>ChatBot Settings</h1>
                            <p className='text-zinc-500 mt-1'>Manage your AI chatbot knowledge and business details</p>
                        </div>

                        
                        {/* Setup Wizard Progress */}
                        {currentStep < 6 && (
                            <div className='mb-8'>
                                <div className='flex gap-2'>
                                    {[1, 2, 3, 4, 5].map(step => (
                                        <div key={step} className={`h-2 flex-1 rounded-full transition-all duration-300 ${currentStep >= step ? 'bg-black' : 'bg-zinc-200'}`}></div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className='min-h-[340px]'>
                            {currentStep === 1 && (
                                <div className='mb-10 space-y-8'>

                                    {/* --- SECTION 1: Basic Information --- */}
                                    <div className='p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm'>
                                        <h2 className='text-base font-bold text-zinc-900 mb-1'>Basic Information <span className='text-red-500'>*</span></h2>
                                        <p className='text-xs text-zinc-500 mb-4'>Core details about your business.</p>
                                        <div className='space-y-3'>
                                            <input type="text" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Business Name *' value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                                            <select className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80 bg-white' value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                                                <option value="" disabled>Select Business Type</option>
                                                <option value="Ecommerce">Ecommerce</option>
                                                <option value="Restaurant">Restaurant</option>
                                                <option value="Salon & Beauty">Salon & Beauty</option>
                                                <option value="Healthcare">Healthcare</option>
                                                <option value="Education">Education</option>
                                                <option value="Real Estate">Real Estate</option>
                                                <option value="Service">Service</option>
                                                <option value="SaaS">SaaS</option>
                                                <option value="Agency">Agency</option>
                                                <option value="Other">Other</option>
                                            </select>
                                            <textarea className='w-full h-20 rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Short Description (what your business does)' value={description} onChange={(e) => setDescription(e.target.value)} />
                                            <input type="text" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Location / Address' value={location} onChange={(e) => setLocation(e.target.value)} />
                                            <input type="text" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Working Hours (e.g. Mon–Sat 9AM–8PM)' value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
                                            <input type="url" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Website (optional, e.g. https://yourbusiness.com)' value={website} onChange={(e) => setWebsite(e.target.value)} />
                                        </div>
                                    </div>

                                    {/* --- SECTION 2: Services / Products --- */}
                                    <div className='p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm'>
                                        <h2 className='text-base font-bold text-zinc-900 mb-1'>Services / Products</h2>
                                        <p className='text-xs text-zinc-500 mb-4'>Add each service or product you offer.</p>

                                        {services.length > 0 && (
                                            <div className='space-y-2 mb-4'>
                                                {services.map((svc, idx) => (
                                                    <div key={idx} className='bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-start justify-between gap-3'>
                                                        <div>
                                                            <p className='text-sm font-semibold text-zinc-800'>{svc.name}</p>
                                                            <p className='text-xs text-zinc-500 mt-0.5'>{svc.description}</p>
                                                            <div className='flex flex-wrap gap-2 mt-1.5'>
                                                                {svc.price && <span className='text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold'>💰 {svc.price}</span>}
                                                                {svc.duration && <span className='text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold'>⏱ {svc.duration}</span>}
                                                                {svc.availability && <span className='text-[10px] bg-zinc-100 text-zinc-600 border border-zinc-200 px-2 py-0.5 rounded-full font-semibold'>📅 {svc.availability}</span>}
                                                            </div>
                                                        </div>
                                                        <button onClick={() => setServices(prev => prev.filter((_, i) => i !== idx))} className='text-red-400 hover:text-red-600 text-xs font-semibold px-2 shrink-0'>Remove</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className='space-y-2 border border-dashed border-zinc-300 rounded-xl p-4 bg-zinc-50'>
                                            <p className='text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2'>Add a Service / Product</p>
                                            <input type="text" placeholder='Name (e.g. Haircut, SEO Package)' className='w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newService.name} onChange={e => setNewService(p => ({...p, name: e.target.value}))} />
                                            <textarea placeholder='Description' className='w-full h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newService.description} onChange={e => setNewService(p => ({...p, description: e.target.value}))} />
                                            <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                                                <input type="text" placeholder='Price (e.g. ₹500, $30, Free)' className='rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newService.price} onChange={e => setNewService(p => ({...p, price: e.target.value}))} />
                                                <input type="text" placeholder='Duration (e.g. 45 mins)' className='rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newService.duration} onChange={e => setNewService(p => ({...p, duration: e.target.value}))} />
                                                <input type="text" placeholder='Availability (e.g. Mon–Fri)' className='rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newService.availability} onChange={e => setNewService(p => ({...p, availability: e.target.value}))} />
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (newService.name.trim()) {
                                                        const updated = [...services, {...newService}];
                                                        setServices(updated);
                                                        setNewService({name:'',description:'',price:'',duration:'',availability:''});
                                                    }
                                                }}
                                                className='w-full px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition'
                                            >
                                                + Add Service / Product
                                            </button>
                                        </div>
                                    </div>

                                    {/* --- SECTION 3: Policies --- */}
                                    <div className='p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm'>
                                        <h2 className='text-base font-bold text-zinc-900 mb-1'>Policies</h2>
                                        <p className='text-xs text-zinc-500 mb-4'>Define your business rules. The AI will quote these accurately.</p>
                                        <div className='space-y-3'>
                                            {[
                                                {label:'Refund Policy', key:'refund', placeholder:'E.g. No refunds after 7 days of purchase.'},
                                                {label:'Cancellation Policy', key:'cancellation', placeholder:'E.g. Cancellations allowed 24 hours before the appointment.'},
                                                {label:'Delivery Policy', key:'delivery', placeholder:'E.g. Free delivery on orders above ₹500. Delivered within 2-3 days.'},
                                                {label:'Booking Rules', key:'bookingRules', placeholder:'E.g. Advance booking required. 50% deposit needed.'},
                                                {label:'Return Policy', key:'returnPolicy', placeholder:'E.g. Returns accepted within 15 days with original packaging.'},
                                                {label:'General Policies', key:'general', placeholder:'E.g. Age restriction, ID requirements, dress code, etc.'},
                                            ].map(({label, key, placeholder}) => (
                                                <div key={key}>
                                                    <label className='block text-xs font-semibold text-zinc-600 mb-1'>{label}</label>
                                                    <textarea className='w-full h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder={placeholder} value={(policies as any)[key]} onChange={e => setPolicies({...policies, [key]: e.target.value})} onBlur={() => handleSettings()} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* --- SECTION 4: Human Support Escalation --- */}
                                    <div className='p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm'>
                                        <h2 className='text-base font-bold text-zinc-900 mb-1'>Human Support Escalation</h2>
                                        <p className='text-xs text-zinc-500 mb-4'>When the AI can&apos;t help, it will direct customers here.</p>
                                        <div className='space-y-3'>
                                            <input type="text" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Support Number (e.g. +91 98765 43210)' value={supportNumber} onChange={(e) => setSupportNumber(e.target.value)} />
                                            <input type="email" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Support Email *' value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
                                            <input type="text" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='WhatsApp Number for customers (e.g. 15551234567)' value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
                                            <input type="text" className='w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='Emergency Contact (optional)' value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
                                        </div>
                                    </div>

                                </div>
                            )}
                            {currentStep === 2 && (
                                <div className='mb-10'>
                                    <h1 className='text-xl font-semibold mb-1'>Step 2: Knowledge Base <span className='text-red-500'>*</span></h1>
                                    <p className='text-sm text-zinc-500 mb-6'>Provide structured facts and unstructured documents.</p>

                                    {/* SECTION A: FAQs */}
                                    <div className='mb-8 p-6 bg-white border border-zinc-200 rounded-2xl shadow-sm'>
                                        <h2 className='text-lg font-bold mb-2'>Section A: FAQs (Structured)</h2>
                                        <p className='text-xs text-zinc-500 mb-4'>Add exact Question & Answer pairs for 100% accuracy.</p>
                                        
                                        <div className='space-y-3 mb-4'>
                                            {faqs.map((faq, idx) => (
                                                <div key={idx} className='bg-zinc-50 border border-zinc-200 rounded-lg p-3'>
                                                    <div className='flex items-start justify-between'>
                                                        <div className='pr-4'>
                                                            <p className='text-xs font-bold text-zinc-500'>Q: {faq.question}</p>
                                                            <p className='text-sm text-zinc-800 mt-1'>A: {faq.answer}</p>
                                                        </div>
                                                        <div className='flex gap-2'>
                                                            <button 
                                                                onClick={() => {
                                                                    setNewFaqQ(faq.question);
                                                                    setNewFaqA(faq.answer);
                                                                    setFaqs(prev => prev.filter((_, i) => i !== idx));
                                                                }}
                                                                className='text-zinc-400 hover:text-zinc-600 text-sm font-medium px-2'
                                                            >
                                                                Edit
                                                            </button>
                                                            <button onClick={() => {
                                                                const updated = faqs.filter((_, i) => i !== idx);
                                                                setFaqs(updated);
                                                                handleSettings({ ownerId, businessName, supportEmail, whatsappNumber, businessType, description, faqs: updated, policies, knowledge, agentInstructions, mediaLinks, aiOverrides });
                                                            }} className='text-red-500 hover:text-red-700 text-sm font-medium px-2'>
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {faqs.length === 0 && (
                                                <p className='text-xs text-zinc-400 italic'>No FAQs added yet.</p>
                                            )}
                                        </div>

                                        <div className='space-y-2'>
                                            <input type="text" placeholder="Question (e.g. What time do you open?)" className='w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newFaqQ} onChange={e => setNewFaqQ(e.target.value)} />
                                            <textarea placeholder="Exact Answer (e.g. We open at 10 AM to 9 PM)" className='w-full h-16 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newFaqA} onChange={e => setNewFaqA(e.target.value)} />
                                            <button
                                                onClick={() => {
                                                    if(newFaqQ.trim() && newFaqA.trim()) {
                                                        const updated = [...faqs, {question: newFaqQ.trim(), answer: newFaqA.trim()}];
                                                        setFaqs(updated);
                                                        setNewFaqQ("");
                                                        setNewFaqA("");
                                                        // Automatically save
                                                        handleSettings({ ownerId, businessName, supportEmail, whatsappNumber, businessType, description, faqs: updated, policies, knowledge, agentInstructions, mediaLinks, aiOverrides });
                                                    }
                                                }}
                                                className='w-full px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition'
                                            >
                                                + Add FAQ
                                            </button>
                                        </div>
                                    </div>

                                    {/* SECTION B: Policies */}
                                    <div className='mb-8 p-6 bg-white border border-zinc-200 rounded-2xl shadow-sm'>
                                        <h2 className='text-lg font-bold mb-2'>Section B: Policies (Fields)</h2>
                                        <p className='text-xs text-zinc-500 mb-4'>Provide strict rules that AI must follow for returns, cancellations, etc.</p>
                                        <div className='space-y-4'>
                                            <div>
                                                <label className='block text-xs font-semibold text-zinc-600 mb-1'>Refund Policy</label>
                                                <textarea className='w-full h-16 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='E.g., No refunds after 7 days...' value={policies.refund} onChange={e => setPolicies({...policies, refund: e.target.value})} onBlur={() => handleSettings()} />
                                            </div>
                                            <div>
                                                <label className='block text-xs font-semibold text-zinc-600 mb-1'>Cancellation Policy</label>
                                                <textarea className='w-full h-16 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='E.g., Cancellations allowed up to 24 hours before...' value={policies.cancellation} onChange={e => setPolicies({...policies, cancellation: e.target.value})} onBlur={() => handleSettings()} />
                                            </div>
                                            <div>
                                                <label className='block text-xs font-semibold text-zinc-600 mb-1'>General Policies</label>
                                                <textarea className='w-full h-16 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' placeholder='E.g., Age restrictions, ID requirements...' value={policies.general} onChange={e => setPolicies({...policies, general: e.target.value})} onBlur={() => handleSettings()} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION C: Upload PDF & General Knowledge */}
                                    <div className='p-6 bg-zinc-50 border border-zinc-200 rounded-2xl shadow-sm'>
                                        <div className='flex items-center justify-between mb-2'>
                                            <h2 className='text-lg font-bold'>Section C: Document Knowledge (RAG)</h2>
                                            {knowledge.trim() && (
                                                <button 
                                                    onClick={async () => { 
                                                        if(confirm("Clear entire Document Knowledge Base and delete from database?")) {
                                                            setKnowledge("");
                                                            await handleSettings({
                                                                ownerId, businessName, supportEmail, whatsappNumber, businessType, description, faqs, policies, knowledge: "", agentInstructions, mediaLinks, aiOverrides
                                                            });
                                                        }
                                                    }}
                                                    className='text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-widest'
                                                >
                                                    Clear Documents
                                                </button>
                                            )}
                                        </div>
                                        <p className='text-xs text-zinc-500 mb-4'>Upload PDFs or paste long descriptions. AI will search this when FAQs don't match.</p>
                                        
                                        <div className='space-y-4'>
                                            <textarea className='w-full h-32 rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80 font-mono bg-white' placeholder={`Paste general information here...`} onChange={(e) => setKnowledge(e.target.value)} value={knowledge} onBlur={() => handleSettings()} />
                                            
                                            <div className='flex flex-wrap items-center gap-3'>
                                                <label className='cursor-pointer flex-shrink-0'>
                                                    <div className={`px-4 py-2 border border-zinc-300 rounded-lg text-sm transition font-medium ${uploadingPdf ? 'bg-zinc-100 text-zinc-400' : 'bg-white hover:bg-zinc-50 text-zinc-700 shadow-sm'}`}>
                                                        {uploadingPdf ? 'Scraping PDF...' : '📄 Upload PDF'}
                                                    </div>
                                                    <input type="file" accept="application/pdf" className='hidden' onChange={handleFileUpload} disabled={uploadingPdf} />
                                                </label>

                                                <button 
                                                    type="button"
                                                    onClick={handleRefineKnowledge}
                                                    disabled={refining || !knowledge.trim()}
                                                    className={`px-4 py-2 border border-emerald-200 rounded-lg text-sm font-medium transition ${refining ? 'bg-emerald-50 text-emerald-400' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}
                                                >
                                                    {refining ? 'Restructuring...' : 'AI Refine Text'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className='mb-10'>
                                    <h1 className='text-xl font-semibold mb-1'>Step 3: Agent Instructions <span className='text-zinc-400 text-sm font-normal'>(Optional)</span></h1>
                                    <p className='text-sm text-zinc-500 mb-6'>Set broad instructions for how the AI should behave.</p>
                                    
                                    <div className='bg-emerald-50/80 border border-emerald-100 rounded-xl p-4 mb-6 flex items-start gap-3'>
                                        <div className='text-emerald-500 mt-0.5'>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        </div>
                                        <div>
                                            <p className='text-sm font-semibold text-emerald-900'>Why add Instructions?</p>
                                            <p className='text-xs text-emerald-800/80 mt-1'>Instructions give your AI a unique personality (e.g., "cheerful", "professional", "concise"). This makes your bot feel more human and perfectly aligned with your brand's voice.</p>
                                        </div>
                                    </div>

                                    <textarea 
                                        className='w-full h-32 rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' 
                                        placeholder="Example: 'Speak in a friendly tone', 'Focus on booking meetings', 'Don't give technical details'"
                                        onChange={(e) => setAgentInstructions(e.target.value)} 
                                        value={agentInstructions} 
                                    />
                                </div>
                            )}

                            {currentStep === 4 && (
                                <div className='mb-10'>
                                    <h1 className='text-xl font-semibold mb-1'>Step 4: Keyword Overrides <span className='text-zinc-400 text-sm font-normal'>(Optional)</span></h1>
                                    <p className='text-sm text-zinc-500 mb-6'>Define specific responses for certain keywords to bypass AI.</p>
                                    
                                    <div className='bg-emerald-50/80 border border-emerald-100 rounded-xl p-4 mb-6 flex items-start gap-3'>
                                        <div className='text-emerald-500 mt-0.5'>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        </div>
                                        <div>
                                            <p className='text-sm font-semibold text-emerald-900'>Why add Overrides?</p>
                                            <p className='text-xs text-emerald-800/80 mt-1'>Overrides let you define exact responses for specific keywords. This ensures 100% accuracy for critical questions (like exact pricing or policies) and saves money by bypassing the AI generation completely.</p>
                                        </div>
                                    </div>
                                    
                                    <div className='space-y-3 mb-4'>
                                        {aiOverrides.map((override, idx) => (
                                            <div key={idx} className='bg-zinc-50 border border-zinc-200 rounded-lg p-3'>
                                                <div className='flex items-start justify-between'>
                                                    <div className='pr-4'>
                                                        <p className='text-xs font-bold text-zinc-500 uppercase tracking-wider'>Topic: {override.topic}</p>
                                                        <p className='text-sm text-zinc-800 mt-1'>{override.response}</p>
                                                    </div>
                                                    <div className='flex gap-2'>
                                                        <button 
                                                            onClick={() => {
                                                                setNewOverrideTopic(override.topic);
                                                                setNewOverrideResponse(override.response);
                                                                setAiOverrides(prev => prev.filter((_, i) => i !== idx));
                                                            }}
                                                            className='text-zinc-400 hover:text-zinc-600 text-sm font-medium px-2'
                                                        >
                                                            Edit
                                                        </button>
                                                        <button onClick={() => deleteOverride(idx)} className='text-red-500 hover:text-red-700 text-sm font-medium px-2'>
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {aiOverrides.length === 0 && (
                                            <p className='text-xs text-zinc-400 italic'>No custom rules added yet.</p>
                                        )}
                                    </div>

                                    <div className='space-y-2'>
                                        <input type="text" placeholder="Trigger Keyword or Topic (e.g. 'refund' or 'timing')" className='w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newOverrideTopic} onChange={e => setNewOverrideTopic(e.target.value)} />
                                        <textarea placeholder="Fixed Response (The bot will say exactly this)" className='w-full h-20 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newOverrideResponse} onChange={e => setNewOverrideResponse(e.target.value)} />
                                        <button
                                            onClick={() => {
                                                if(newOverrideTopic.trim() && newOverrideResponse.trim()) {
                                                    setAiOverrides(prev => [...prev, {topic: newOverrideTopic.trim(), response: newOverrideResponse.trim()}]);
                                                    setNewOverrideTopic("");
                                                    setNewOverrideResponse("");
                                                }
                                            }}
                                            className='w-full px-4 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition'
                                        >
                                            + Add AI Rule Override
                                        </button>
                                    </div>
                                </div>
                            )}

                            {currentStep === 5 && (
                                <div className='mb-10'>
                                    <h1 className='text-xl font-semibold mb-1'>Step 5: Media & Photo Links <span className='text-zinc-400 text-sm font-normal'>(Optional)</span></h1>
                                    <p className='text-sm text-zinc-500 mb-6'>Add image or product links the AI can use.</p>
                                    
                                    <div className='bg-emerald-50/80 border border-emerald-100 rounded-xl p-4 mb-6 flex items-start gap-3'>
                                        <div className='text-emerald-500 mt-0.5'>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        </div>
                                        <div>
                                            <p className='text-sm font-semibold text-emerald-900'>Why add Media Links?</p>
                                            <p className='text-xs text-emerald-800/80 mt-1'>Providing rich visual links allows the AI to automatically send images, catalogs, or PDFs when customers ask about specific products. This significantly boosts engagement and sales!</p>
                                        </div>
                                    </div>
                                    
                                    <div className='space-y-3 mb-4'>
                                        {mediaLinks.map((link, idx) => (
                                            <div key={idx} className='flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-lg p-3'>
                                                <div className='truncate pr-4'>
                                                    <p className='text-sm font-semibold text-zinc-800'>{link.name}</p>
                                                    <a href={link.url} target='_blank' rel='noreferrer' className='text-xs text-blue-500 hover:underline truncate block'>{link.url}</a>
                                                </div>
                                                <div className='flex gap-2'>
                                                    <button 
                                                        onClick={() => {
                                                            setNewLinkName(link.name);
                                                            setNewLinkUrl(link.url);
                                                            setMediaLinks(prev => prev.filter((_, i) => i !== idx));
                                                        }}
                                                        className='text-zinc-400 hover:text-zinc-600 text-sm font-medium px-2'
                                                    >
                                                        Edit
                                                    </button>
                                                    <button onClick={() => deleteMediaLink(idx)} className='text-red-500 hover:text-red-700 text-sm font-medium px-2'>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {mediaLinks.length === 0 && (
                                            <p className='text-xs text-zinc-400 italic'>No media links added yet.</p>
                                        )}
                                    </div>

                                    <div className='flex gap-2 items-center'>
                                        <div className='flex-1 grid grid-cols-1 md:grid-cols-2 gap-2'>
                                            <input type="text" placeholder="Label (e.g., 'Pricing PDF' or 'Hostel Photo')" className='w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newLinkName} onChange={e => setNewLinkName(e.target.value)} />
                                            <input type="url" placeholder="https://..." className='w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80' value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} />
                                        </div>
                                        <button
                                            onClick={() => {
                                                if(newLinkName.trim() && newLinkUrl.trim()) {
                                                    setMediaLinks(prev => [...prev, {name: newLinkName.trim(), url: newLinkUrl.trim()}]);
                                                    setNewLinkName("");
                                                    setNewLinkUrl("");
                                                }
                                            }}
                                            className='px-4 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition whitespace-nowrap'
                                        >
                                            + Add Link
                                        </button>
                                        <div className="relative">
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={handlePhotoUpload} 
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                disabled={isUploadingPhoto}
                                            />
                                            <button 
                                                disabled={isUploadingPhoto}
                                                className='px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition whitespace-nowrap disabled:bg-blue-400'
                                            >
                                                {isUploadingPhoto ? "Uploading..." : "↑ Upload Photo"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 6 && (
                                <div className='mb-10'>
                                    <h1 className='text-lg font-medium mb-4'>WhatsApp Integration</h1>
                                    {wsStatus.isReady ? (
                                        <div className='bg-emerald-50 border border-emerald-100 rounded-xl p-6 flex items-center gap-5'>
                                            <div className='w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xl shadow-lg shadow-emerald-600/20'>✓</div>
                                            <div>
                                                <p className='font-bold text-emerald-900'>System Connected</p>
                                                <p className='text-xs text-emerald-600 font-medium mt-1'>AI is now answering messages on {whatsappNumber || "your linked number"}</p>
                                            </div>
                                        </div>
                                    ) : wsStatus.disconnecting ? (
                                        <div className='flex flex-col items-center py-6'>
                                            <div className='w-14 h-14 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mb-5 animate-pulse'>...</div>
                                            <p className='text-sm font-medium text-zinc-600'>Disconnecting...</p>
                                        </div>
                                    ) : wsStatus.qrCode ? (
                                        <div className='flex flex-col items-center text-center'>
                                            <div className='bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mb-6'>
                                                <QRCode value={wsStatus.qrCode} size={200} viewBox={`0 0 256 256`} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                                            </div>
                                            <h2 className='text-lg font-bold text-zinc-900'>Scan to Link</h2>
                                            <p className='text-sm text-zinc-500 max-w-xs mt-2'>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                                        </div>
                                    ) : (
                                        <div className='flex flex-col items-center py-6 text-center'>
                                            <div className='w-14 h-14 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-center mb-5'>💬</div>
                                            <p className='text-sm font-medium text-zinc-700 mb-1'>Not Connected</p>
                                            <p className='text-xs text-zinc-500 mb-6 max-w-sm'>Connect your WhatsApp to start answering customer messages automatically.</p>
                                            <button
                                                disabled={wsLoading}
                                                onClick={handleConnectWhatsApp}
                                                className='px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition disabled:opacity-60'
                                            >
                                                {wsLoading ? 'Connecting...' : 'Connect WhatsApp'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Wizard Navigation */}
                        <div className='flex items-center justify-between border-t border-zinc-200 pt-6 mt-4'>
                            {currentStep === 6 ? (
                                <button 
                                    onClick={() => setCurrentStep(1)}
                                    className='px-6 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium hover:bg-zinc-50 transition flex items-center gap-2'
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                    Change Business Settings
                                </button>
                            ) : (
                                <button 
                                    onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                                    disabled={currentStep === 1 || loading}
                                    className='px-6 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium hover:bg-zinc-50 transition disabled:opacity-50'
                                >
                                    Back
                                </button>
                            )}
                            
                            <div className='flex items-center gap-3'>
                                {saved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-medium text-emerald-600">✓ Saved</motion.span>}
                                
                                {/* Skip button — only on optional steps 2–5 */}
                                {currentStep > 1 && currentStep < 6 && (
                                    <button
                                        onClick={() => setCurrentStep(prev => Math.min(6, prev + 1))}
                                        className='px-5 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition'
                                    >
                                        Skip
                                    </button>
                                )}

                                {currentStep < 6 ? (
                                    <button 
                                        onClick={async () => {
                                            if (currentStep === 1) {
                                                if (!businessName.trim()) {
                                                    alert("Please enter your Business Name to continue.");
                                                    return;
                                                }
                                            }
                                            // Advance step immediately so UI never feels frozen
                                            setCurrentStep(prev => Math.min(6, prev + 1));
                                            try {
                                                await handleSettings();
                                            } catch (_) {
                                                // Save failed silently — data is preserved in state
                                            }
                                        }}
                                        disabled={loading}
                                        className='px-6 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-60'
                                    >
                                        {loading ? "Saving..." : "Save & Next"}
                                    </button>
                                ) : (
                                    <div className='flex items-center gap-3 px-5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200'>
                                        <span className='w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse'></span>
                                        <span className='text-sm font-semibold text-emerald-700'>Setup Complete — Ready to use</span>
                                    </div>
                                )}
                            </div>
                        </div>

                    </motion.div>
                </div>

                {/* Test ChatBot Output Sandbox */}
                {/* Right Column: Sticky Container */}
                <div className='flex flex-col gap-4 sticky top-24 h-max'>
                    {/* Test ChatBot Output Sandbox - iPhone Mockup */}
                    <motion.div
                        className='w-full bg-white rounded-[2.8rem] shadow-2xl border-[11px] border-black overflow-hidden flex flex-col relative'
                        style={{ height: '680px', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)' }}
                    >
                    {/* iPhone Dynamic Island */}
                    <div className="absolute top-[12px] left-1/2 -translate-x-1/2 w-[110px] h-[32px] bg-black rounded-full z-[60] flex items-center justify-between px-3 shadow-md border border-white/5">
                        <div className="w-3 h-3 rounded-full bg-white/10"></div>
                        <div className="w-3 h-3 rounded-full bg-white/10"></div>
                    </div>

                    {/* iOS Status Bar */}
                    <div className={`${currentStep < 6 ? 'bg-transparent text-zinc-800' : 'bg-[#008069] text-white'} h-[52px] w-full flex items-center justify-between px-7 z-[70] absolute top-0 left-0 pt-1 transition-colors duration-500`}>
                        <span className="text-[14px] font-semibold tracking-wide ml-1 mt-1">9:41</span>
                        <div className="flex items-center gap-[5px] mr-1 mt-1">
                            <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 24 24"><path d="M2 22h20V2L2 22z"/></svg>
                            <svg className="w-[16px] h-[16px]" fill="currentColor" viewBox="0 0 24 24"><path d="M12.01 21.49L23.64 7c-.45-.34-4.93-4-11.64-4C5.28 3 .81 6.66.36 7l11.63 14.49.01.01.01-.01z"/></svg>
                            <div className={`w-[22px] h-[11px] border-[1.5px] ${currentStep < 6 ? 'border-zinc-800' : 'border-white'} rounded-[3px] p-[1.5px] flex items-center relative transition-colors duration-500`}>
                                <div className={`w-[14px] h-full ${currentStep < 6 ? 'bg-zinc-800' : 'bg-white'} rounded-[1px] transition-colors duration-500`}></div>
                                <div className={`absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-[4px] ${currentStep < 6 ? 'bg-zinc-800' : 'bg-white'} rounded-r-sm transition-colors duration-500`}></div>
                            </div>
                        </div>
                    </div>

                    {/* BASE LAYER: iOS Home Screen */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#e5f0ff] to-[#b3d4ff] flex flex-col pt-[52px] z-0 overflow-hidden">
                        {/* App Grid */}
                        <div className="w-full mt-16 px-6 grid grid-cols-4 gap-y-6 gap-x-4 place-items-center">
                            {/* Mail */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-sm">
                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Mail</span>
                            </div>
                            {/* Calendar */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-white flex flex-col items-center overflow-hidden shadow-sm">
                                    <div className="w-full bg-red-500 h-3"></div>
                                    <span className="text-[22px] font-light text-zinc-800 leading-none mt-1">{new Date().getDate()}</span>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Calendar</span>
                            </div>
                            {/* Photos */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-white flex items-center justify-center overflow-hidden shadow-sm relative">
                                    <div className="w-4 h-4 rounded-full bg-red-400 absolute top-2 right-2 mix-blend-multiply opacity-80"></div>
                                    <div className="w-4 h-4 rounded-full bg-blue-400 absolute bottom-2 left-2 mix-blend-multiply opacity-80"></div>
                                    <div className="w-4 h-4 rounded-full bg-green-400 absolute bottom-2 right-2 mix-blend-multiply opacity-80"></div>
                                    <div className="w-4 h-4 rounded-full bg-yellow-400 absolute top-2 left-2 mix-blend-multiply opacity-80"></div>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Photos</span>
                            </div>
                            {/* Camera */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-zinc-200 flex items-center justify-center shadow-sm relative">
                                    <div className="w-6 h-6 rounded-full border-2 border-zinc-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-zinc-500 absolute top-2 right-2"></div>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Camera</span>
                            </div>
                            {/* Weather */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-gradient-to-b from-blue-300 to-blue-500 flex items-center justify-center shadow-sm">
                                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Weather</span>
                            </div>
                            {/* Notes */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-white border border-zinc-100 flex items-start justify-start p-2 shadow-sm flex-col gap-1">
                                    <div className="w-full h-1 bg-yellow-400 rounded-full"></div>
                                    <div className="w-3/4 h-1 bg-zinc-200 rounded-full"></div>
                                    <div className="w-1/2 h-1 bg-zinc-200 rounded-full"></div>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Notes</span>
                            </div>
                            {/* Stocks */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-[52px] h-[52px] rounded-[12px] bg-black flex items-center justify-center shadow-sm relative overflow-hidden">
                                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">Stocks</span>
                            </div>
                            {/* WhatsApp (Pending Setup) */}
                            <div className="flex flex-col items-center gap-1 group relative">
                                <div className={`w-[52px] h-[52px] rounded-[12px] bg-[#25D366] flex items-center justify-center shadow-sm relative transition-all duration-300 ${currentStep < 6 ? 'opacity-50 grayscale' : 'opacity-100 grayscale-0'}`}>
                                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12.01 2.01c-5.52 0-10 4.48-10 10 0 1.94.55 3.75 1.5 5.25L2.01 22l4.89-1.46c1.47.91 3.22 1.45 5.1 1.45 5.52 0 10-4.48 10-10s-4.48-10-10-10zm0 18.17c-1.63 0-3.18-.42-4.52-1.15l-3.23.97.98-3.14c-.81-1.41-1.28-3.04-1.28-4.78 0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8zm4.33-5.59c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.61.77-.75.93-.14.16-.28.18-.52.06-1.57-.79-2.77-1.84-3.84-3.58-.11-.18-.01-.28.11-.4.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.69 2.58 4.1 3.57 1.05.43 1.57.51 2.11.45.54-.06 1.4-.57 1.6-1.12.2-.55.2-.1.14-.12z"/></svg>
                                </div>
                                <span className="text-[10px] text-zinc-700 font-medium tracking-wide">WhatsApp</span>
                                <AnimatePresence>
                                    {currentStep < 6 && (
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0 }}
                                            className="absolute -top-2 -right-2 bg-black text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full z-10 animate-bounce shadow-sm"
                                        >
                                            SETUP
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Setup Overlay Message */}
                        <AnimatePresence>
                            {currentStep < 6 && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    className="absolute inset-x-6 bottom-[130px] bg-white/70 backdrop-blur-md border border-white/50 shadow-xl rounded-[20px] p-6 text-center"
                                >
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-zinc-100">
                                        <svg className="w-6 h-6 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                    </div>
                                    <h3 className="text-zinc-900 font-bold text-base mb-1">Setup your bot</h3>
                                    <p className="text-sm text-zinc-600 font-medium leading-relaxed">Complete the configuration wizard on the left to deploy your bot to WhatsApp.</p>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Bottom Dock */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] h-[74px] bg-white/40 backdrop-blur-2xl rounded-[24px] px-4 flex items-center justify-between border border-white/60 shadow-sm">
                            {/* Phone */}
                            <div className="w-[52px] h-[52px] rounded-[12px] bg-gradient-to-b from-green-400 to-green-500 flex items-center justify-center shadow-sm">
                                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                            </div>
                            {/* Safari */}
                            <div className="w-[52px] h-[52px] rounded-[12px] bg-white flex items-center justify-center shadow-sm">
                                <svg className="w-9 h-9 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 13.59L8 16l2.41-5.41L16 8l-2.59 7.59zM12 10.75c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25z"/></svg>
                            </div>
                            {/* Messages */}
                            <div className="w-[52px] h-[52px] rounded-[12px] bg-gradient-to-b from-green-400 to-green-500 flex items-center justify-center shadow-sm">
                                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                            </div>
                            {/* Music */}
                            <div className="w-[52px] h-[52px] rounded-[12px] bg-gradient-to-b from-rose-400 to-rose-600 flex items-center justify-center shadow-sm">
                                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                            </div>
                        </div>
                    </div>

                    {/* OVERLAY LAYER: WhatsApp App */}
                    <AnimatePresence>
                        {currentStep >= 6 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8, y: 50, filter: 'blur(5px)', borderRadius: '40px' }}
                                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', borderRadius: '0px' }}
                                exit={{ opacity: 0, scale: 0.8, y: 50, filter: 'blur(5px)', borderRadius: '40px' }}
                                transition={{ type: "spring", damping: 24, stiffness: 220 }}
                                className="absolute inset-0 z-[60] bg-[#EFEAE2] flex flex-col pt-[52px] overflow-hidden shadow-2xl"
                                style={{ transformOrigin: '80% 30%' }}
                            >
                                {/* WhatsApp Header */}
                                <div className='bg-[#008069] text-white px-4 pb-3 pt-2 flex items-center justify-between shrink-0 z-10 shadow-sm'>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-white/90 cursor-pointer -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
                                        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden">
                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                                        </div>
                                        <div className="flex flex-col ml-1">
                                            <span className='font-semibold text-[15px] leading-tight'>WhatsApp Bot Preview</span>
                                            <span className='text-[11px] text-white/80 font-medium'>online</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <svg className="w-[18px] h-[18px] text-white cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                                        <svg className="w-[18px] h-[18px] text-white cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                    </div>
                                </div>

                                {/* WhatsApp Chat Area */}
                                <div className='flex-1 overflow-y-auto p-4 space-y-3 bg-[#EFEAE2] flex flex-col relative z-0' style={{ scrollBehavior: 'smooth' }}>
                                    {/* Background subtle pattern could go here, for now solid color */}
                                    <div className="flex justify-center my-2">
                                        <span className="bg-[#fff]/80 text-[#54656f] px-3 py-1 rounded-lg text-[11px] font-medium shadow-sm uppercase tracking-wide">Today</span>
                                    </div>
                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`relative text-[14.2px] px-3 pt-2 pb-5 max-w-[85%] leading-relaxed break-words shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
                                                msg.role === 'user' 
                                                    ? 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none' 
                                                    : 'bg-white text-[#111b21] rounded-lg rounded-tl-none'
                                            }`}>
                                                {msg.role === 'user' && (
                                                    <div className="absolute top-0 -right-2 w-2 h-3 bg-[#d9fdd3]" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}></div>
                                                )}
                                                {msg.role !== 'user' && (
                                                    <div className="absolute top-0 -left-2 w-2 h-3 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>
                                                )}
                                                <span className="block whitespace-pre-wrap pl-1 pr-2">{msg.content}</span>
                                                <div className="absolute bottom-1 right-2 flex items-center gap-1">
                                                    <span className="text-[10px] text-gray-500 font-medium">12:00</span>
                                                    {msg.role === 'user' && (
                                                        <svg className="w-[14px] h-[14px] text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className='flex justify-start'>
                                            <div className={`relative text-[14.2px] px-4 py-3 max-w-[85%] bg-white text-[#111b21] rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]`}>
                                                <div className="absolute top-0 -left-2 w-2 h-3 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>
                                                <div className='flex gap-1.5 items-center px-1'>
                                                    <span className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }}></span>
                                                    <span className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }}></span>
                                                    <span className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }}></span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Footer Input Area */}
                                <form onSubmit={handleTestChat} className='px-2 py-2.5 bg-[#f0f2f5] flex items-end gap-2 shrink-0 z-10'>
                                    <div className="flex-1 min-w-0 bg-white rounded-3xl flex items-center py-1 min-h-[44px] shadow-sm">
                                        <div className="flex items-center shrink-0 w-10 justify-center">
                                            <svg className="w-[24px] h-[24px] text-[#8696a0] cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                        </div>
                                        <input 
                                            type="text" 
                                            className='flex-1 min-w-0 border-none focus:outline-none focus:ring-0 px-1 py-2 text-[15px] bg-transparent text-[#111b21]' 
                                            placeholder='Message' 
                                            value={testMessage} 
                                            onChange={(e) => setTestMessage(e.target.value)} 
                                            disabled={chatLoading}
                                        />
                                        <div className="flex items-center gap-3 shrink-0 pr-3 pl-1">
                                            <svg className="w-[20px] h-[20px] text-[#8696a0] cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                            <svg className="w-5 h-5 text-[#8696a0] cursor-pointer" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm8 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 2c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
                                        </div>
                                    </div>
                                    <button 
                                        type="submit" 
                                        disabled={chatLoading || !testMessage.trim()} 
                                        className={`w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0 transition shadow-sm ${
                                            testMessage.trim() ? 'bg-[#00a884] text-white hover:bg-[#008f6f]' : 'bg-[#00a884] text-white'
                                        }`}
                                    >
                                        {testMessage.trim() ? (
                                            <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                                        )}
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Unanswered Questions Pop-up Button */}
                {unansweredQuestions.length > 0 && (
                    <motion.button 
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => setIsUqModalOpen(true)}
                        className='w-full bg-white rounded-2xl shadow-md border border-zinc-200 px-4 py-3 flex items-center justify-between hover:border-red-300 hover:bg-red-50/50 transition cursor-pointer'
                    >
                        <div className='flex items-center gap-3'>
                            <div className='w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm'>
                                {unansweredQuestions.length}
                            </div>
                            <div className='text-left'>
                                <span className='font-semibold text-zinc-800 text-[13px]'>Unanswered Questions</span>
                            </div>
                        </div>
                        <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    </motion.button>
                )}
            </div>
            </div>
            <Dialog open={isUqModalOpen} onOpenChange={setIsUqModalOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col p-0 rounded-2xl">
                    <DialogHeader className="px-6 py-4 border-b border-zinc-100 shrink-0 bg-white">
                        <div className='flex items-center justify-between mt-1'>
                            <div className='flex items-center gap-2.5'>
                                <DialogTitle className="text-lg text-zinc-900 font-bold">Unanswered Questions</DialogTitle>
                                <span className='flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-wider border border-emerald-200'>
                                    <span className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />
                                    Live
                                </span>
                            </div>
                            <div className='px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[11px] font-semibold rounded-md'>
                                {unansweredQuestions.length} pending
                            </div>
                        </div>
                        <DialogDescription className="mt-1 text-[13px]">
                            Questions your bot couldn&apos;t answer. Respond here to train your AI instantly.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 bg-zinc-50/50">
                        {uqLoading ? (
                            <div className='py-10 text-center text-sm text-zinc-400'>Loading questions...</div>
                        ) : unansweredQuestions.length === 0 ? (
                            <div className='py-10 text-center'>
                                <p className='text-sm text-zinc-500 font-medium'>All caught up!</p>
                                <p className='text-xs text-zinc-400 mt-1'>No unanswered questions right now.</p>
                            </div>
                        ) : (
                            <div className='space-y-3'>
                                {unansweredQuestions.map((q) => (
                                    <motion.div
                                        key={q._id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                                        className='border border-zinc-200 rounded-xl p-4 bg-white shadow-sm'
                                    >
                                        <div className='flex items-start justify-between gap-3'>
                                            <div className='flex-1 min-w-0'>
                                                <p className='text-[14px] font-medium text-zinc-800 leading-relaxed'>&quot;{q.question}&quot;</p>
                                                <div className='flex items-center gap-2 mt-2.5'>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${
                                                        q.source === "whatsapp" 
                                                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                                                            : "bg-blue-50 text-blue-600 border border-blue-200"
                                                    }`}>
                                                        {q.source === "whatsapp" ? (
                                                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>
                                                        ) : (
                                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg>
                                                        )}
                                                        {q.source}
                                                    </span>
                                                    {q.contactNumber && (
                                                        <span className='text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200'>
                                                            {q.contactNumber.replace("@c.us", "")}
                                                        </span>
                                                    )}
                                                    <span className='text-[10px] text-zinc-400'>{new Date(q.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div className='flex flex-col items-end gap-1.5 shrink-0'>
                                                <button
                                                    onClick={() => {
                                                        setAnsweringId(answeringId === q._id ? null : q._id)
                                                        setAnswerText("")
                                                    }}
                                                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                                                        answeringId === q._id ? "bg-zinc-200 text-zinc-700" : "bg-zinc-900 text-white hover:bg-zinc-800"
                                                    }`}
                                                >
                                                    {answeringId === q._id ? "Cancel" : "Answer"}
                                                </button>
                                                <button
                                                    onClick={() => handleDismissQuestion(q._id)}
                                                    className='text-[10px] font-medium text-zinc-400 hover:text-red-500 transition px-1'
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {answeringId === q._id && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className='overflow-hidden'
                                                >
                                                    <div className='mt-3 pt-3 border-t border-zinc-100'>
                                                        <textarea
                                                            value={answerText}
                                                            onChange={(e) => setAnswerText(e.target.value)}
                                                            placeholder={q.source === "whatsapp" ? "Type your answer... This will be sent to the customer on WhatsApp instantly." : "Type the answer... This will be added to your knowledge base."}
                                                            className='w-full h-20 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/80 resize-none bg-zinc-50'
                                                            autoFocus
                                                        />
                                                        <div className='flex items-center justify-between mt-2.5'>
                                                            <span className='text-[10px] text-zinc-500 flex items-center gap-1'>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                {q.source === "whatsapp" 
                                                                    ? "Sent to customer + Added to Knowledge Base" 
                                                                    : "Added to Knowledge Base for future AI replies"}
                                                            </span>
                                                            <motion.button
                                                                whileHover={{ scale: 1.02 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                disabled={submittingAnswer || !answerText.trim()}
                                                                onClick={() => {
                                                                    handleAnswerQuestion(q._id)
                                                                    if (unansweredQuestions.length <= 1) {
                                                                        setIsUqModalOpen(false)
                                                                    }
                                                                }}
                                                                className='px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50'
                                                            >
                                                                {submittingAnswer ? "Saving..." : "Save Answer"}
                                                            </motion.button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>


            <Dialog open={isDisconnectDialogOpen} onOpenChange={setIsDisconnectDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Disconnect WhatsApp?</DialogTitle>
                        <DialogDescription>
                            This will stop the AI from answering messages on your linked number. You will need to scan the QR code to reconnect.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex sm:justify-end gap-3 mt-4">
                        <button
                            onClick={() => setIsDisconnectDialogOpen(false)}
                            className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium hover:bg-zinc-50 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDisconnectWhatsApp}
                            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
                        >
                            Disconnect Now
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default DashboardClient
