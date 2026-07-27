import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('memories')
@Index('IDX_memories_user_created', ['userId', 'createdAt'])
export class MemoryEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', nullable: true })
  category?: string;

  @Column({ type: 'simple-json', nullable: true })
  tags?: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
