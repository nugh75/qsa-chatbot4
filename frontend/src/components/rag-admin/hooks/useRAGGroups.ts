import { useState } from 'react'

export interface RAGGroup { id: number; name: string; description?: string; document_count?: number; chunk_count?: number }

interface UseRAGGroups {
	groups: RAGGroup[];
	loading: boolean;
	error: string | null;
	selectedGroup: RAGGroup | null;
	refresh: () => Promise<void>;
	create: (name: string, description?: string) => Promise<boolean>;
	update: (group: RAGGroup, name: string, description?: string) => Promise<boolean>;
	remove: (groupId: number) => Promise<boolean>;
	setSelectedGroup: (g: RAGGroup | null) => void;
	exportGroup: (groupId: number) => Promise<void>;
}

const useRAGGroups = (): UseRAGGroups => {
	const [groups, setGroups] = useState<RAGGroup[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string|null>(null)
	const [selectedGroup, setSelectedGroup] = useState<RAGGroup|null>(null)

	const refresh = async () => {
		setLoading(true); setError(null)
		try {
			const res = await fetch('/api/rag/groups', { credentials: 'include' })
			const data = await res.json()
			if (data.success) {
				setGroups(data.groups || [])
				// keep selected group reference updated
				if (selectedGroup) {
					const updated = (data.groups || []).find((g: RAGGroup)=> g.id === selectedGroup.id)
					if (updated) setSelectedGroup(updated)
				}
			} else {
				setError(data.detail || 'Errore caricamento gruppi')
			}
		} catch (e:any) {
			setError(e.message || 'Errore rete gruppi')
		} finally { setLoading(false) }
	}

	const create = async (name: string, description?: string) => {
		try {
			const res = await fetch('/api/rag/groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, description }), credentials:'include' })
			const data = await res.json(); if (data.success){ await refresh(); return true };
			return false
		} catch { return false }
	}
	const update = async (group: RAGGroup, name: string, description?: string) => { /* placeholder: backend update not implemented */ return true }
	const remove = async (groupId: number) => {
		try { const res = await fetch(`/api/rag/groups/${groupId}`, { method:'DELETE', credentials:'include' }); const data = await res.json(); if (data.success){ await refresh(); if(selectedGroup?.id===groupId) setSelectedGroup(null); return true } } catch {}
		return false
	}
	const exportGroup = async (groupId: number) => {
		try { window.open(`/api/rag/debug/groups/${groupId}/chunks`, '_blank') } catch {}
	}

	return { groups, loading, error, selectedGroup, refresh, create, update, remove, setSelectedGroup, exportGroup }
}

export default useRAGGroups
