import { db } from '../../database';
import { user } from '../../user';
import { topics } from '../../topics';

interface Socket {
    uid: number;
    id: number;
}

interface SocketTopics {
    markAsRead(socket: Socket, tids: number[]): Promise<void>;
    markTopicNotificationsRead(socket: Socket, tids: number[]): Promise<void>;
    markAllRead(socket: Socket): Promise<void>;
    markCategoryTopicsRead(socket: Socket, cid: number): Promise<void>;
    markUnread(socket: Socket, tid: number): Promise<void>;
    markAsUnreadForAll(socket: Socket, tids: number[]): Promise<void>;
  }

export = function (SocketTopics: SocketTopics) {
    SocketTopics.markAsRead = async function (socket: Socket, tids: number[]): Promise<void> {
        if (!Array.isArray(tids) || socket.uid <= 0) {
            throw new Error('[[error:invalid-data]]');
        }
        const hasMarked = await topics.markAsRead(tids, socket.uid);
        const promises = [topics.markTopicNotificationsRead(tids, socket.uid)];
        if (hasMarked) {
            promises.push(topics.pushUnreadCount(socket.uid));
        }
        await Promise.all(promises);
    };

    SocketTopics.markTopicNotificationsRead = async function (socket: Socket, tids: number[]): Promise<void> {
        if (!Array.isArray(tids) || !socket.uid) {
            throw new Error('[[error:invalid-data]]');
        }
        await topics.markTopicNotificationsRead(tids, socket.uid);
    };

    SocketTopics.markAllRead = async function (socket: Socket): Promise<void> {
        if (socket.uid <= 0) {
            throw new Error('[[error:invalid-uid]]');
        }
        await topics.markAllRead(socket.uid);
        topics.pushUnreadCount(socket.uid);
    };

    SocketTopics.markCategoryTopicsRead = async function (socket: Socket, cid: number): Promise<void> {
        const tids = await topics.getUnreadTids({ cid: cid, uid: socket.uid, filter: '' });
        await SocketTopics.markAsRead(socket, tids);
    };

    SocketTopics.markUnread = async function (socket: Socket, tid: number): Promise<void> {
        if (!tid || socket.uid <= 0) {
            throw new Error('[[error:invalid-data]]');
        }
        await topics.markUnread(tid, socket.uid);
        topics.pushUnreadCount(socket.uid);
    };

    SocketTopics.markAsUnreadForAll = async function (socket: Socket, tids: number[]): Promise<void> {
        if (!Array.isArray(tids)) {
            throw new Error('[[error:invalid-tid]]');
        }

        if (socket.uid <= 0) {
            throw new Error('[[error:no-privileges]]');
        }
        const isAdmin = await user.isAdministrator(socket.uid);
        const now = Date.now();
        await Promise.all(tids.map(async (tid) => {
            const topicData = await topics.getTopicFields(tid, ['tid', 'cid']);
            if (!topicData.tid) {
                throw new Error('[[error:no-topic]]');
            }
            const isMod = await user.isModerator(socket.uid, topicData.cid);
            if (!isAdmin && !isMod) {
                throw new Error('[[error:no-privileges]]');
            }
            await topics.markAsUnreadForAll(tid);
            await topics.updateRecent(tid, now);
            await db.sortedSetAdd(`cid:${topicData.cid}:tids:lastposttime`, now, tid);
            await topics.setTopicField(tid, 'lastposttime', now);
        }));
        topics.pushUnreadCount(socket.uid);
    };
};
