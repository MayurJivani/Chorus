import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../hooks/useSession';
import {
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  respondToRequest,
  removeFriend,
  getMessages,
  sendMessageToFriend,
  type FriendView,
  type PendingRequest,
  type MessageView,
} from '../api/friends';
import { usePageTitle } from '../hooks/usePageTitle';

export function FriendsPage() {
  usePageTitle('Friends');

  const { user } = useSession();
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [chatWith, setChatWith] = useState<FriendView | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    getFriends()
      .then(setFriends)
      .catch(() => {});
    getPendingRequests()
      .then(setPending)
      .catch(() => {});
  }, [userId]);

  if (!user) {
    return (
      <div className="flex min-h-full items-center justify-center px-4">
        <p className="text-slate-400">Log in to add friends and chat.</p>
      </div>
    );
  }

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const result = await sendFriendRequest(email);
      setSuccess(`Request sent to ${result.addressee}`);
      setEmail('');
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleRespond = async (friendshipId: number, accept: boolean) => {
    await respondToRequest(friendshipId, accept);
    setPending((p) => p.filter((r) => r.friendshipId !== friendshipId));
    if (accept) getFriends().then(setFriends);
  };

  const handleRemove = async (friendshipId: number) => {
    await removeFriend(friendshipId);
    setFriends((f) => f.filter((fr) => fr.friendshipId !== friendshipId));
  };

  if (chatWith) {
    return (
      <ChatView
        friend={chatWith}
        userId={user.id}
        onBack={() => {
          setChatWith(null);
          getFriends().then(setFriends);
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-6 px-4 py-6">
      <motion.h1
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-extrabold gradient-text"
      >
        Friends
      </motion.h1>

      {/* Add friend form */}
      <form onSubmit={handleSendRequest} className="flex gap-2">
        <input
          type="email"
          placeholder="Friend's email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-chorus-accent/50"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-chorus-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-chorus-accent/80"
        >
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">{success}</p>}

      {/* Pending requests */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pending requests
          </h2>
          {pending.map((r) => (
            <div
              key={r.friendshipId}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="text-sm font-medium text-white">{r.displayName}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRespond(r.friendshipId, true)}
                  className="rounded-lg bg-green-600/80 px-3 py-1 text-xs font-semibold text-white"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRespond(r.friendshipId, false)}
                  className="rounded-lg bg-red-600/60 px-3 py-1 text-xs font-semibold text-white"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Friends list */}
      {friends.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Your friends
          </h2>
          {friends.map((f) => (
            <div
              key={f.friendshipId}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">{f.displayName}</span>
                <span className="text-[11px] text-slate-500">{f.rating} rating</span>
              </div>
              <div className="flex items-center gap-2">
                {f.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-chorus-accent px-1.5 text-[10px] font-bold text-white">
                    {f.unreadCount}
                  </span>
                )}
                <button
                  onClick={() => setChatWith(f)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
                >
                  Chat
                </button>
                <button
                  onClick={() => handleRemove(f.friendshipId)}
                  className="rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-center text-sm text-slate-500">
          No friends yet. Add someone by their email above.
        </p>
      )}
    </div>
  );
}

function ChatView({
  friend,
  userId,
  onBack,
}: {
  friend: FriendView;
  userId: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMessages(friend.userId).then(setMessages);
    const interval = setInterval(() => {
      getMessages(friend.userId).then(setMessages);
    }, 5000);
    return () => clearInterval(interval);
  }, [friend.userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendMessageToFriend(friend.userId, text.trim());
      setMessages((prev) => [...prev, { ...msg, senderName: 'You', read: true }]);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const handleInvite = async (type: 'duel' | 'multiplayer') => {
    setSending(true);
    try {
      const body = type === 'duel' ? 'Want to duel?' : 'Join my game!';
      const msg = await sendMessageToFriend(friend.userId, body, { type, id: 0 });
      setMessages((prev) => [...prev, { ...msg, senderName: 'You', read: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
        >
          Back
        </button>
        <h2 className="text-lg font-bold text-white">{friend.displayName}</h2>
      </div>

      {/* Invite buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => handleInvite('duel')}
          disabled={sending}
          className="rounded-lg border border-chorus-accent/30 px-3 py-1.5 text-xs font-medium text-chorus-accent transition-colors hover:bg-chorus-accent/10"
        >
          Invite to Duel
        </button>
        <button
          onClick={() => handleInvite('multiplayer')}
          disabled={sending}
          className="rounded-lg border border-chorus-accent/30 px-3 py-1.5 text-xs font-medium text-chorus-accent transition-colors hover:bg-chorus-accent/10"
        >
          Invite to Multiplayer
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-center text-sm text-slate-500">No messages yet. Say hi!</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderId === userId;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                    isMine ? 'bg-chorus-accent/20 text-white' : 'bg-white/5 text-slate-200'
                  }`}
                >
                  {msg.invite && (
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-chorus-accent">
                      Game invite
                    </span>
                  )}
                  <p>{msg.body}</p>
                  <span className="mt-1 block text-[10px] text-slate-500">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-chorus-accent/50"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="shrink-0 rounded-xl bg-chorus-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-chorus-accent/80 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
