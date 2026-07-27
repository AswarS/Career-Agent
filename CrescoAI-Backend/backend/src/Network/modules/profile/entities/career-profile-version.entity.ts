import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { UserEntity } from "../../user/entities/user.entity.js";

@Entity("career_profile_versions")
@Index(
  "IDX_career_profile_versions_user_version_unique",
  ["userId", "version"],
  { unique: true },
)
@Index("IDX_career_profile_versions_user_hash", ["userId", "contentHash"])
export class CareerProfileVersionEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Index("IDX_career_profile_versions_user")
  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: UserEntity;

  @Column({ type: "integer" })
  version!: number;

  @Column({ type: "varchar", length: 100 })
  schemaVersion!: string;

  @Column({ type: "text" })
  profileJson!: string;

  @Column({ type: "varchar", length: 64 })
  contentHash!: string;

  @Column({ type: "varchar", length: 100 })
  createdBy!: string;

  @Column({ type: "varchar", nullable: true })
  sourceThreadId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
