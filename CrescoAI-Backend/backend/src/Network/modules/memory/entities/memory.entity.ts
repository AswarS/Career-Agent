import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('memories')
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
