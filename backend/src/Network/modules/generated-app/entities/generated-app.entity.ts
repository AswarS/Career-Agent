import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('generated_apps')
export class GeneratedAppEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string;

  @Column({ type: 'varchar', nullable: true })
  messageId?: string;

  @Column({ type: 'varchar' })
  appName!: string;

  @Column({ type: 'text', nullable: true })
  appPath?: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'varchar', default: 'created' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

