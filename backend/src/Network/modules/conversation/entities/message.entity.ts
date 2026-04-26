import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  messageId!: string;

  @Column({ type: 'varchar' })
  conversationId!: string;

  @Column({ type: 'varchar', nullable: true })
  resourceId?: string;

  @Column({ type: 'varchar', nullable: true })
  resourceKind?: string;

  @Column({ type: 'text', nullable: true })
  resourcePath?: string;

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string;

  @Column({ type: 'varchar', nullable: true })
  title?: string;

  @Column({ type: 'integer', nullable: true })
  sizeBytes?: number;

  @Column({ type: 'datetime' })
  createdAt!: Date;
}
