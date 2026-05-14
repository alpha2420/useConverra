"use client";

import WorkflowBuilder from "@/components/WorkflowBuilder";
import { motion } from "framer-motion";

export default function WorkflowsPage() {
    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen bg-zinc-50"
        >
            <WorkflowBuilder />
        </motion.div>
    );
}
