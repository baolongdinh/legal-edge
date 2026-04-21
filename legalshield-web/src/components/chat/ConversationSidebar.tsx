import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Star,
  Trash2,
  MoreVertical,
  MessageSquare,
  Clock,
  Edit2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/DropdownMenu';
import { clsx, type ClassValue } from 'clsx';
import { formatDistanceToNow } from '../../lib/date-utils';
import type { Conversation } from '../../store/conversationStore';
import { Dialog } from '../ui/Dialog';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  filter: 'all' | 'starred' | 'archived';
  searchQuery: string;
  isLoading?: boolean;
  onSelectConversation: (conversation: Conversation) => void;
  onCreateConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onStarConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onSetFilter: (filter: 'all' | 'starred' | 'archived') => void;
  onSetSearchQuery: (query: string) => void;
  className?: string;
}

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  selectedConversation,
  filter,
  searchQuery,
  isLoading,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  onStarConversation,
  onRenameConversation,
  onSetFilter,
  onSetSearchQuery,
  className,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(null);

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      onRenameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleDelete = (id: string) => {
    onDeleteConversation(id);
    setShowDeleteDialog(false);
    setDeleteConversationId(null);
  };

  const handleFilterClick = (value: 'all' | 'starred' | 'archived') => {
    onSetFilter(value);
  };

  return (
    <div className={cn('flex flex-col h-full bg-[#f6f3f2] border-r border-[#e4e2e1]', className)}>
      {/* Header */}
      <div className="p-6 border-b border-[#e4e2e1] space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif italic text-xl text-[#041627]">Tra cứu gần đây</h2>
          <button
            onClick={onCreateConversation}
            className="h-8 w-8 rounded bg-[#fbcc32] text-[#041627] flex items-center justify-center hover:shadow-md transition-all active:scale-95"
          >
            <Plus size={18} strokeWidth={3} />
          </button>
        </div>

        {/* Search Input styled like mockup */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#041627] transition-colors" />
          <input
            placeholder="Tìm kiếm nội dung..."
            value={searchQuery}
            onChange={(e) => onSetSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#e4e2e1] rounded h-9 pl-9 pr-3 text-sm focus:outline-none focus:border-[#fbcc32] transition-colors placeholder:text-slate-400"
          />
        </div>

        {/* Filter chips style */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => handleFilterClick('all')}
            className={cn(
              'whitespace-nowrap px-3 py-1.5 text-xs font-semibold rounded transition-all',
              filter === 'all'
                ? 'bg-[#041627] text-white shadow-sm'
                : 'text-slate-500 hover:text-[#041627] hover:bg-slate-100'
            )}
          >
            Tất cả
          </button>
          <button
            onClick={() => handleFilterClick('starred')}
            className={cn(
              'whitespace-nowrap px-3 py-1.5 text-xs font-semibold rounded transition-all',
              filter === 'starred'
                ? 'bg-[#041627] text-white shadow-sm'
                : 'text-slate-500 hover:text-[#041627] hover:bg-slate-100'
            )}
          >
            Ghim
          </button>
          <button
            onClick={() => handleFilterClick('archived')}
            className={cn(
              'whitespace-nowrap px-3 py-1.5 text-xs font-semibold rounded transition-all',
              filter === 'archived'
                ? 'bg-[#041627] text-white shadow-sm'
                : 'text-slate-500 hover:text-[#041627] hover:bg-slate-100'
            )}
          >
            Lưu trữ
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-200/50 rounded animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-20 text-center opacity-40">
            <MessageSquare size={32} className="mx-auto mb-2" />
            <p className="text-xs uppercase tracking-widest font-bold">Trống</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {conversations.map((conversation) => (
              <motion.div
                key={conversation.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  'group relative p-3 rounded cursor-pointer transition-all border-l-2',
                  selectedConversation?.id === conversation.id
                    ? 'bg-white border-[#fbcc32] shadow-sm'
                    : 'border-transparent hover:bg-white/60 hover:border-slate-300'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  {editingId === conversation.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-white border border-[#fbcc32] rounded h-6 px-2 text-xs focus:outline-none"
                        autoFocus
                        onBlur={handleSaveEdit}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ) : (
                    <>
                      <h3 className={cn(
                        "text-sm line-clamp-1 flex-1 font-medium italic transition-colors",
                        selectedConversation?.id === conversation.id ? "text-[#041627]" : "text-slate-600"
                      )}>
                        {conversation.title}
                      </h3>

                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1 text-slate-400 hover:text-[#041627]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical size={14} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-[#e4e2e1] shadow-xl">
                            <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); handleStartEdit(conversation); }}>
                              <Edit2 size={14} className="mr-2" /> Đổi tên
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); onStarConversation(conversation.id); }}>
                              <Star size={14} className={cn("mr-2", conversation.is_starred && "fill-[#fbcc32] text-[#fbcc32]")} />
                              {conversation.is_starred ? 'Bỏ ghim' : 'Ghim'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-700"
                              onClick={() => { setDeleteConversationId(conversation.id); setShowDeleteDialog(true); }}
                            >
                              <Trash2 size={14} className="mr-2" /> Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                  <Clock size={10} />
                  <span>{formatDistanceToNow(new Date(conversation.updated_at))}</span>
                  <span>·</span>
                  <span>{conversation.message_count} tin</span>
                  {conversation.is_starred && <Star size={10} className="fill-[#fbcc32] text-[#fbcc32]" />}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => deleteConversationId && handleDelete(deleteConversationId)}
        title="Xác nhận xóa"
        description="Bạn có chắc chắn muốn xóa cuộc trò chuyện này? Hành động này không thể hoàn tác."
        variant="danger"
        confirmText="Xóa"
        cancelText="Hủy"
      />
    </div>
  );
});
