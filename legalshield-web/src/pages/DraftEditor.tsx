import { useState } from 'react'
import { SplitView } from '../components/layout/SplitView'
import { Typography } from '../components/ui/Typography'
import { Button } from '../components/ui/Button'
import { useEditorStore, type Clause } from '../store'
import { Search, Download, Save, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEffect } from 'react'

const categoryColors: Record<string, string> = {
    'bảo mật': 'bg-blue-500/20 text-blue-300',
    'bồi thường': 'bg-red-500/20 text-red-300',
    'tranh chấp': 'bg-amber-500/20 text-amber-300',
    'thanh toán': 'bg-green-500/20 text-green-300',
    'chung': 'bg-slate-500/20 text-slate-300',
}

interface DraftEditorProps { clauseMode?: boolean }

export function DraftEditor({ clauseMode = false }: DraftEditorProps) {
    const { activeDraft, searchQuery, setDraft, setSearch, insertClause, clauseLibrary } = useEditorStore()
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [isSaving, setIsSaving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    useEffect(() => {
        const fetchTemplates = async () => {
            const { data, error } = await supabase.from('templates').select('*')
            if (!error && data) {
                useEditorStore.setState({ clauseLibrary: data as Clause[] })
            }
        }
        fetchTemplates()
    }, [])

    const categories = ['all', ...Array.from(new Set(clauseLibrary.map((c) => c.category)))]
    const filtered = clauseLibrary.filter((c) => {
        const matchCat = selectedCategory === 'all' || c.category === selectedCategory
        const matchQ = searchQuery === '' || c.title.toLowerCase().includes(searchQuery.toLowerCase())
        return matchCat && matchQ
    })

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Unauthorized')

            const { error } = await supabase.from('contracts').upsert({
                user_id: user.id,
                content: activeDraft,
                status: 'draft',
                updated_at: new Date().toISOString()
            })
            if (error) throw error
        } catch (err) {
            console.error('Save failed:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleExport = async () => {
        setIsExporting(true)
        try {
            const { data, error } = await supabase.functions.invoke('export-pdf', {
                body: { html_content: `<html><body><h1>HỢP ĐỒNG</h1><div style="white-space: pre-wrap;">${activeDraft}</div></body></html>` }
            })
            if (error) throw error

            // Download the PDF
            const blob = new Blob([data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'contract.pdf'
            a.click()
        } catch (err) {
            console.error('Export failed:', err)
        } finally {
            setIsExporting(false)
        }
    }

    const clausePanel = (
        <div className="h-full flex flex-col border-r border-slate-border">
            <div className="p-4 border-b border-slate-border space-y-3">
                <Typography variant="label">Kho điều khoản</Typography>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm điều khoản..."
                        className="w-full pl-9 pr-3 py-2 text-sm bg-navy-base border border-slate-border rounded-md text-paper-dark placeholder-slate-muted focus:outline-none focus:border-gold-primary transition-colors"
                    />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {categories.map((cat) => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedCategory === cat ? 'border-gold-primary text-gold-primary bg-gold-primary/10' : 'border-slate-border text-slate-muted hover:border-slate-muted'
                                }`}
                        >
                            {cat === 'all' ? 'Tất cả' : cat}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {filtered.map((clause) => (
                    <div key={clause.id} className="p-3 rounded-md bg-navy-elevated border border-slate-border hover:border-gold-muted transition-colors cursor-pointer group"
                        onClick={() => insertClause(clauseLibrary, clause.id)}>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${categoryColors[clause.category] ?? categoryColors['chung']}`}>{clause.category}</span>
                        </div>
                        <Typography variant="body" className="text-xs font-medium">{clause.title}</Typography>
                    </div>
                ))}
            </div>
        </div>
    )

    const editorPanel = (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-border">
                <Typography variant="label">Bản thảo hợp đồng</Typography>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Lưu bản thảo
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleExport} disabled={isExporting}>
                        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Xuất PDF
                    </Button>
                </div>
            </div>
            <div className="flex-1 p-5">
                {/* Simulated A4 preview */}
                <div className="max-w-[640px] mx-auto bg-paper-light text-navy-base rounded shadow-lg min-h-[860px] p-10 font-sans text-sm leading-7">
                    <h1 className="font-serif text-2xl font-bold text-center mb-6">HỢP ĐỒNG</h1>
                    <textarea
                        value={activeDraft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Bắt đầu soạn thảo hoặc chèn điều khoản từ thư viện bên trái..."
                        className="w-full h-full min-h-[720px] bg-transparent resize-none outline-none text-navy-base font-sans text-sm leading-7"
                    />
                </div>
            </div>
        </div>
    )

    return clauseMode
        ? <SplitView ratio="33/67" left={clausePanel} right={editorPanel} className="h-full" />
        : <SplitView ratio="25/75" left={clausePanel} right={editorPanel} className="h-full" />
}
