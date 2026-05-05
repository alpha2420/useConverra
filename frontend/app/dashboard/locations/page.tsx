'use client';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'motion/react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

interface LocationData {
    _id: string;
    name: string;
    city: string;
    address: string;
    phone: string;
    timings: string;
    description: string;
}

export default function LocationsPage() {
    const [locations, setLocations] = useState<LocationData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentLoc, setCurrentLoc] = useState<Partial<LocationData>>({});
    const [saving, setSaving] = useState(false);

    const [uploadingCsv, setUploadingCsv] = useState(false);

    const fetchLocations = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/locations');
            setLocations(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocations();
    }, []);

    const handleSave = async () => {
        if (!currentLoc.name || !currentLoc.city) {
            alert("Name and City are required");
            return;
        }
        setSaving(true);
        try {
            await axios.post('/api/locations', currentLoc);
            setIsAddModalOpen(false);
            setCurrentLoc({});
            fetchLocations();
        } catch (err) {
            console.error(err);
            alert("Failed to save location");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this location?")) return;
        try {
            await axios.delete(`/api/locations?id=${id}`);
            setLocations(locations.filter(l => l._id !== id));
        } catch (err) {
            console.error(err);
            alert("Failed to delete location");
        }
    };

    const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingCsv(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await axios.post("/api/locations/bulk", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            alert(res.data.message);
            fetchLocations();
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.message || "Failed to upload CSV");
        } finally {
            setUploadingCsv(false);
            e.target.value = ''; // Reset
        }
    };

    const filteredLocations = locations.filter(l => 
        l.name.toLowerCase().includes(search.toLowerCase()) || 
        l.city.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Locations Directory</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage all your properties, stores, or branches so AI can assist customers accurately.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <label className="cursor-pointer">
                        <div className={`px-4 py-2 border border-gray-300 rounded-lg text-sm transition font-medium ${uploadingCsv ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'}`}>
                            {uploadingCsv ? 'Uploading...' : '📄 Bulk Upload CSV'}
                        </div>
                        <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} disabled={uploadingCsv} />
                    </label>
                    <button 
                        onClick={() => {
                            setIsEditMode(false);
                            setCurrentLoc({});
                            setIsAddModalOpen(true);
                        }}
                        className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition shadow-sm"
                    >
                        + Add Location
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <input 
                        type="text" 
                        placeholder="Search locations by name or city..." 
                        className="w-full md:max-w-md rounded-xl border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Name / Branch</th>
                                <th className="px-6 py-4">City</th>
                                <th className="px-6 py-4 hidden md:table-cell">Contact & Timing</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">Loading locations...</td>
                                </tr>
                            ) : filteredLocations.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">No locations found.</td>
                                </tr>
                            ) : (
                                filteredLocations.map(loc => (
                                    <tr key={loc._id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 font-medium text-gray-900">{loc.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {loc.city}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 hidden md:table-cell">
                                            {loc.phone && <div className="text-xs text-gray-500 mb-1">📞 {loc.phone}</div>}
                                            {loc.timings && <div className="text-xs text-gray-500">🕒 {loc.timings}</div>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => {
                                                    setCurrentLoc(loc);
                                                    setIsEditMode(true);
                                                    setIsAddModalOpen(true);
                                                }}
                                                className="text-gray-400 hover:text-black font-medium text-sm mr-4 transition"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(loc._id)}
                                                className="text-red-400 hover:text-red-600 font-medium text-sm transition"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-xl bg-white p-6 rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">{isEditMode ? 'Edit Location' : 'Add New Location'}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600">Location Name <span className="text-red-500">*</span></label>
                            <input 
                                type="text" 
                                placeholder="e.g. Downtown Branch" 
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                                value={currentLoc.name || ""}
                                onChange={e => setCurrentLoc({...currentLoc, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600">City <span className="text-red-500">*</span></label>
                            <input 
                                type="text" 
                                placeholder="e.g. Mumbai" 
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                                value={currentLoc.city || ""}
                                onChange={e => setCurrentLoc({...currentLoc, city: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-gray-600">Full Address</label>
                            <input 
                                type="text" 
                                placeholder="e.g. 123 Main St, Near Park" 
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                                value={currentLoc.address || ""}
                                onChange={e => setCurrentLoc({...currentLoc, address: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600">Phone Number</label>
                            <input 
                                type="text" 
                                placeholder="e.g. +1 555-0123" 
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                                value={currentLoc.phone || ""}
                                onChange={e => setCurrentLoc({...currentLoc, phone: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600">Timings</label>
                            <input 
                                type="text" 
                                placeholder="e.g. 9 AM - 8 PM" 
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                                value={currentLoc.timings || ""}
                                onChange={e => setCurrentLoc({...currentLoc, timings: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-gray-600">Description / Details</label>
                            <textarea 
                                placeholder="e.g. Under construction, launching Q4 2026. Valet parking available." 
                                className="w-full h-20 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                                value={currentLoc.description || ""}
                                onChange={e => setCurrentLoc({...currentLoc, description: e.target.value})}
                            />
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <button 
                            onClick={() => setIsAddModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Location'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
