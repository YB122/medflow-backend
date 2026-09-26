import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation, ConversationDocument, Message, MessageDocument } from './schemas/chat.schema.js';

@Injectable()
export class ChatService {
  /** userId -> socket ids (online tracking). */
  private readonly online = new Map<string, Set<string>>();

  constructor(
    @InjectModel(Conversation.name) private convs: Model<ConversationDocument>,
    @InjectModel(Message.name) private msgs: Model<MessageDocument>,
  ) {}

  markOnline(userId: string, socketId: string) {
    const set = this.online.get(userId) ?? new Set();
    set.add(socketId);
    this.online.set(userId, set);
  }

  markOffline(userId: string, socketId: string) {
    const set = this.online.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) this.online.delete(userId);
    }
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  async getOrCreate(patientId: string, doctorId: string) {
    const existing = await this.convs.findOne({ patientId, doctorId });
    if (existing) return existing;
    return this.convs.create({ patientId, doctorId });
  }

  async assertMember(conversationId: string, userId: string) {
    const conv = await this.convs.findById(conversationId);
    if (!conv) throw new NotFoundException('conversation not found');
    if (String(conv.patientId) !== userId && String(conv.doctorId) !== userId) {
      throw new ForbiddenException('not a member');
    }
    return conv;
  }

  async send(conversationId: string, senderId: string, text: string) {
    await this.assertMember(conversationId, senderId);
    if (!text?.trim()) throw new ForbiddenException('empty message');
    return this.msgs.create({ conversationId, senderId, text: text.trim() });
  }

  async history(conversationId: string, userId: string, page = 1, limit = 50) {
    await this.assertMember(conversationId, userId);
    const items = await this.msgs
      .find({ conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();
    return items.reverse();
  }

  async markRead(conversationId: string, userId: string) {
    await this.assertMember(conversationId, userId);
    await this.msgs.updateMany(
      { conversationId, senderId: { $ne: userId }, read: false },
      { $set: { read: true } },
    );
    return { ok: true };
  }

  myConversations(userId: string) {
    return this.convs
      .find({ $or: [{ patientId: userId }, { doctorId: userId }] })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
  }
}
