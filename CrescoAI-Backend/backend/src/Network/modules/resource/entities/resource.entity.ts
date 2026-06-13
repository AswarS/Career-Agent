import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('resources')
export class ResourceEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  conversationId!: string;

  @Column({ type: 'varchar' })
  messageId!: string;

  @Column({ type: 'varchar' })
  resourceId!: string;

  @Column({ type: 'varchar', nullable: true })
  artifactId?: string;

  @Column({ type: 'varchar' })
  resourceKind!: string;

  @Column({ type: 'text' })
  resourcePath!: string;

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string;

  @Column({ type: 'varchar', nullable: true })
  title?: string;

  @Column({ type: 'integer', nullable: true })
  sizeBytes?: number;

  @CreateDateColumn()
  createdAt!: Date;
}

