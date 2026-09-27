import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument, Message, MessageDocument } from './schemas/chat.schema.js';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';

@Injectable()
export class ChatService {
  /** userId -> socket ids (online tracking). */
  private readonly online = new Map<string, Set<string>>();

  constructor(
    @InjectModel(Conversation.name) private convs: Model<ConversationDocument>,
    @InjectModel(Message.name) private msgs: Model<MessageDocument>,
    @InjectModel(Doctor.name) private doctorProfiles: Model<DoctorDocument>,
    @InjectModel(User.name) private users: Model<UserDocument>,
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

  /**
   * Resolve anything the client pastes (doctor *profile* id or *user* id)
   * to the account id used for membership. Unknown ids are rejected so no
   * dead conversation (with zero members) can be created.
   */
  private async resolveUserId(id: string, side: 'patient' | 'doctor'): Promise<string> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`invalid ${side} id`);
    }
    const profile = await this.doctorProfiles.findById(id).select('userId').lean().exec();
    if (profile) return String(profile.userId);
    const user = await this.users.findById(id).select('_id').lean().exec();
    if (!user) throw new NotFoundException(`${side} not found`);
    return String((user as any)._id);
  }

  async getOrCreate(patientId: string, doctorId: string) {
    const pid = await this.resolveUserId(patientId, 'patient');
    const did = await this.resolveUserId(doctorId, 'doctor');
    if (pid === did) throw new BadRequestException('cannot chat with yourself');
    const existing = await this.convs.findOne({ patientId: pid, doctorId: did });
    if (existing) return existing;
    return this.convs.create({ patientId: pid, doctorId: did });
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
