import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('conversations')
@Index('IDX_conversations_user_updated', ['userId', 'updatedAt'])
export class ConversationEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  cid!: number;
  @Column({type:'text'})
  id!: string;
  @Column({ nullable: false })
  userId!: number;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  preview?: string;

  @Column({ default: 'active' })
  status!: string;

  @Column()
  updatedAt!: Date;

  @Column()
  createdAt!: Date;
}
