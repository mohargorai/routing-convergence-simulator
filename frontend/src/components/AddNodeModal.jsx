import React, { useState } from 'react';
import { X, Plus, Server } from 'lucide-react';

export default function AddNodeModal({ onClose, onAddNode, existingNodes }) {
  const [nodeId, setNodeId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanId = nodeId.trim().toUpperCase();
    if (!cleanId) {
      setError('Router ID is required (e.g. X, G, R5)');
      return;
    }
    if (existingNodes.some((n) => n.id === cleanId)) {
      setError(`Router ${cleanId} already exists`);
      return;
    }

    onAddNode(cleanId, label.trim() || `Router ${cleanId}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm bg-[#0f172a] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
            <Server className="w-4 h-4" />
            Add Router Node
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Router ID / Key</label>
            <input
              type="text"
              maxLength={4}
              placeholder="e.g. G"
              value={nodeId}
              onChange={(e) => {
                setNodeId(e.target.value);
                setError('');
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase outline-none focus:border-cyan-400"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Friendly Label (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Gateway Core Router"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          {error && <div className="text-rose-400 font-mono text-[11px]">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Router
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

