import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type MessageRole = 'user' | 'assistant' | 'system';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  conversationId!: number;

  @Column({ type: 'varchar' })
  role!: MessageRole;

  @Column({ type: 'varchar' })
  kind!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ nullable: true, type: 'text' })
  reasoning?: string;

  @Column({ nullable: true })
  agentId?: string;

  @Column({ nullable: true })
  agentName?: string;

  @Column({ type: 'simple-json', nullable: true })
  actions?: string[];

  @Column({ type: 'simple-json', nullable: true })
  media?: string[];

  @Column()
  createdAt!: Date;
}
