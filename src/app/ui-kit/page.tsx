"use client";

import { useState } from "react";
import {
  IconAlertTriangle,
  IconDownload,
  IconEdit,
  IconFilter,
  IconInfoCircle,
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconSparkles,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Checkbox,
  ComingSoon,
  ConfirmDialog,
  DateInput,
  EmptyState,
  FilterCombobox,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  Modal,
  MoneyInput,
  Radio,
  ReadField,
  RiskBadge,
  SearchInput,
  Segments,
  Select,
  Spinner,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  UserCell,
  useToast,
} from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Dữ liệu mẫu                                        */
/* ------------------------------------------------------------------ */

const OWNERS = [
  {
    value: "u1",
    label: "Nguyễn Văn Bình",
    description: "Giám đốc Khối Sản xuất",
  },
  { value: "u2", label: "Trần Thu Hà", description: "Trưởng phòng KSNB" },
  { value: "u3", label: "Lê Minh Quang", description: "Chuyên viên QTRR" },
  { value: "u4", label: "Phạm Ngọc Ánh", description: "Trưởng phòng Nhân sự" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Nháp", dot: "#717680" },
  { value: "pending", label: "Chờ duyệt", dot: "#1570EF" },
  { value: "tracking", label: "Đang theo dõi", dot: "#245FDF" },
  { value: "closed", label: "Đã đóng", dot: "#12B76A" },
];

const UNIT_OPTIONS = [
  { value: "sx", label: "Khối Sản xuất" },
  { value: "kd", label: "Khối Kinh doanh" },
  { value: "tc", label: "Khối Tài chính" },
  { value: "it", label: "Trung tâm CNTT" },
];

/* ------------------------------------------------------------------ */
/* Khối bọc chung                                        */
/* ------------------------------------------------------------------ */

function Block({
  title,
  note,
  children,
  align = "end",
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <section className="misa-card p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
        {note && (
          <span className="text-[12px] text-text-secondary">{note}</span>
        )}
      </div>
      <div
        className={`flex flex-wrap gap-3 ${
          align === "end"
            ? "items-end"
            : align === "center"
              ? "items-center"
              : "items-start"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Trang preview                                        */
/* ------------------------------------------------------------------ */

export default function UiKitPage() {
  const toast = useToast();

  // Tabs & Segments
  const [tab, setTab] = useState("all");
  const [seg, setSeg] = useState("list");
  const [view, setView] = useState("table");

  // Modal
  const [openModal, setOpenModal] = useState(false);
  const [openLargeModal, setOpenLargeModal] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Form
  const [keyword, setKeyword] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("a");
  const [sw, setSw] = useState(true);
  const [date, setDate] = useState("2026-08-16");
  const [money, setMoney] = useState<number | null>(1200000);
  const [desc, setDesc] = useState("Rủi ro gián đoạn hệ thống máy chủ nội bộ.");

  function handleDelete() {
    setConfirmLoading(true);
    setTimeout(() => {
      setConfirmLoading(false);
      setOpenDelete(false);
      toast.success("Xoá thành công", "Bản ghi đã được xoá khỏi hệ thống.");
    }, 900);
  }

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4 p-6">
      {/* ------------------------- Tiêu đề ------------------------- */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-h2">MISA GRC - Bộ component</h1>
          <p className="text-[13px] text-text-secondary">
            Trang xem trước Giai đoạn 2A. Có thể xoá khi hoàn thiện dự án.
          </p>
        </div>
        <Badge tone="brand">v0.1 - Giai đoạn 2A</Badge>
      </header>

      {/* --------------------------- Button ------------------------ */}
      <Block title="Button" note="Cao 32px, bo góc 8px, min-width 84px">
        <Button variant="primary" icon={<IconPlus size={16} />}>
          Thêm mới
        </Button>
        <Button variant="secondary" icon={<IconDownload size={16} />}>
          Xuất khẩu
        </Button>
        <Button variant="text">Huỷ bỏ</Button>
        <Button variant="danger" icon={<IconTrash size={16} />}>
          Xoá
        </Button>
        <Button variant="danger-outline">Từ chối</Button>
        <Button variant="ai" icon={<IconSparkles size={16} />}>
          Gợi ý bằng AI
        </Button>
        <Button variant="primary" loading>
          Đang lưu
        </Button>
        <Button variant="primary" disabled>
          Không khả dụng
        </Button>
        <Button variant="secondary" size="sm" compact>
          Nhỏ
        </Button>
        <Button variant="secondary" size="lg">
          Lớn
        </Button>
      </Block>

      <Block title="IconButton & Spinner" align="center">
        <IconButton label="Sửa" variant="outline">
          <IconEdit size={16} />
        </IconButton>
        <IconButton label="Xoá">
          <IconTrash size={16} />
        </IconButton>
        <IconButton label="Bộ lọc" variant="outline">
          <IconFilter size={16} />
        </IconButton>
        <IconButton label="Thêm" variant="brand">
          <IconPlus size={16} />
        </IconButton>
        <IconButton label="Không khả dụng" variant="outline" disabled>
          <IconEdit size={16} />
        </IconButton>
        <Spinner size={18} className="text-brand" />
      </Block>

      {/* ------------------------- Nhập liệu ----------------------- */}
      <Block title="Nhập liệu">
        <Input
          label="Tên rủi ro"
          required
          placeholder="Nhập tên rủi ro"
          wrapperClassName="w-[260px]"
        />
        <Input
          label="Mã rủi ro"
          value="RISK-2026-001"
          readOnly
          disabled
          wrapperClassName="w-[180px]"
        />
        <Input
          label="Email liên hệ"
          error="Email không hợp lệ"
          defaultValue="abc@"
          wrapperClassName="w-[220px]"
        />
        <Input
          label="Ngưỡng cảnh báo"
          hint="Nhập giá trị từ 0 đến 100"
          type="number"
          defaultValue={80}
          suffix="%"
          wrapperClassName="w-[200px]"
        />
        <DateInput
          label="Ngày phát hiện"
          required
          value={date}
          onChange={setDate}
          className="w-[180px]"
        />
        <MoneyInput
          label="Tổn thất ước tính"
          value={money}
          onChange={setMoney}
          className="w-[220px]"
        />
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="Tìm theo mã, tên rủi ro"
        />
      </Block>

      <Block title="Textarea" align="start">
        <div className="w-[420px]">
          <Textarea
            label="Mô tả rủi ro"
            required
            rows={3}
            maxLength={500}
            showCount
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Mô tả chi tiết bối cảnh và nguyên nhân"
          />
        </div>
        <div className="w-[320px]">
          <Textarea
            label="Ghi chú"
            rows={3}
            error="Vui lòng nhập ghi chú khi từ chối"
            defaultValue=""
          />
        </div>
      </Block>

      {/* ------------------------ Chọn dữ liệu --------------------- */}
      <Block title="Select & Combobox lọc">
        <Select
          label="Chủ sở hữu rủi ro"
          required
          searchable
          clearable
          options={OWNERS}
          value={owner}
          onChange={setOwner}
          className="w-[260px]"
          placeholder="Chọn người phụ trách"
        />
        <Select
          label="Đơn vị"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={setUnit}
          className="w-[220px]"
          placeholder="Chọn đơn vị"
        />
        <Select
          label="Trạng thái (có chấm màu)"
          options={STATUS_OPTIONS}
          value={null}
          onChange={() => {}}
          className="w-[200px]"
          placeholder="Chọn trạng thái"
        />
      </Block>

      <Block
        title="FilterCombobox"
        note="Nhãn tĩnh + giá trị + chevron"
        align="center"
      >
        <FilterCombobox
          label="Trạng thái:"
          multiple
          options={STATUS_OPTIONS}
          value={statuses}
          onChange={setStatuses}
          width={230}
        />
        <FilterCombobox
          label="Đơn vị:"
          options={unit ? UNIT_OPTIONS : UNIT_OPTIONS}
          value={unit}
          onChange={setUnit}
          searchable
          width={230}
        />
        <FilterCombobox
          label="Chủ sở hữu:"
          options={OWNERS}
          value={owner}
          onChange={setOwner}
          searchable
          width={250}
        />
      </Block>

      {/* ------------------------- Lựa chọn ------------------------ */}
      <Block title="Checkbox / Radio / Switch" align="center">
        <Checkbox
          label="Rủi ro không khoan nhượng"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <Checkbox label="Trạng thái hỗn hợp" indeterminate readOnly />
        <Checkbox label="Không khả dụng" disabled readOnly />
        <Radio
          name="treatment"
          label="Chấp nhận rủi ro"
          checked={radio === "a"}
          onChange={() => setRadio("a")}
        />
        <Radio
          name="treatment"
          label="Giảm thiểu rủi ro"
          description="Cần lập kế hoạch KPPN"
          checked={radio === "b"}
          onChange={() => setRadio("b")}
        />
        <Switch checked={sw} onChange={setSw} label="Bật cảnh báo KRI" />
      </Block>

      {/* -------------------------- Badge -------------------------- */}
      <Block title="Badge mức độ rủi ro" align="center">
        <RiskBadge level="Thấp" score={4} />
        <RiskBadge level="Trung bình" score={9} />
        <RiskBadge level="Cao" score={15} />
        <RiskBadge level="Trọng yếu" score={25} />
      </Block>

      <Block title="Badge trạng thái nghiệp vụ" align="center">
        <StatusBadge status="Nháp" />
        <StatusBadge status="Chờ duyệt" />
        <StatusBadge status="Đã duyệt" />
        <StatusBadge status="Đang theo dõi" />
        <StatusBadge status="Đang xử lý" />
        <StatusBadge status="Hoàn thành" />
        <StatusBadge status="Quá hạn" />
        <StatusBadge status="Đã đóng" />
        <StatusBadge status="Hiệu quả" />
        <StatusBadge status="Hiệu quả một phần" />
        <StatusBadge status="Không hiệu quả" />
        <Badge tone="brand">Từ AMIS Mục tiêu</Badge>
        <Badge tone="info" size="sm">
          Đồng bộ JIRA
        </Badge>
      </Block>

      {/* ---------------------- Tabs & Segments -------------------- */}
      <section className="misa-card p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-text-primary">
          Tabs
        </h3>
        <Tabs
          items={[
            { key: "all", label: "Tất cả", count: 128 },
            { key: "mine", label: "Của tôi", count: 12 },
            { key: "critical", label: "Trọng yếu", count: 5 },
            { key: "closed", label: "Đã đóng" },
            { key: "archived", label: "Lưu trữ", disabled: true },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="pt-3 text-[13px] text-text-secondary">
          Đang xem tab: <b className="text-text-primary">{tab}</b>
        </div>
      </section>

      <Block title="Segments" align="center">
        <Segments
          items={[
            { key: "list", label: "Danh sách" },
            { key: "matrix", label: "Ma trận" },
            { key: "chart", label: "Biểu đồ" },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <Segments
          size="sm"
          items={[
            { key: "table", icon: <IconTable size={16} />, title: "Dạng bảng" },
            {
              key: "grid",
              icon: <IconLayoutGrid size={16} />,
              title: "Dạng thẻ",
            },
            {
              key: "line",
              icon: <IconList size={16} />,
              title: "Dạng danh sách",
            },
          ]}
          value={view}
          onChange={setView}
        />
      </Block>

      {/* ------------------------- Tooltip ------------------------- */}
      <Block title="Tooltip" align="center">
        <Tooltip content="Hiển thị phía trên">
          <Button variant="secondary">Top</Button>
        </Tooltip>
        <Tooltip content="Hiển thị phía dưới" placement="bottom">
          <Button variant="secondary">Bottom</Button>
        </Tooltip>
        <Tooltip content="Hiển thị bên trái" placement="left">
          <Button variant="secondary">Left</Button>
        </Tooltip>
        <Tooltip
          content="Điểm rủi ro = Khả năng xảy ra × Mức độ ảnh hưởng, tính theo ma trận 5x5"
          placement="right"
        >
          <span className="inline-flex items-center gap-1 text-[13px] text-brand">
            <IconInfoCircle size={16} /> Cách tính điểm rủi ro
          </span>
        </Tooltip>
      </Block>

      {/* -------------------------- Avatar ------------------------- */}
      <Block title="Avatar & người dùng" align="center">
        <Avatar name="Nguyễn Văn Bình" />
        <Avatar name="Trần Thu Hà" size={36} />
        <UserCell name="Lê Minh Quang" sub="Chuyên viên QTRR" />
        <AvatarGroup
          names={[
            "Nguyễn Văn Bình",
            "Trần Thu Hà",
            "Lê Minh Quang",
            "Phạm Ngọc Ánh",
            "Đỗ Hải Yến",
          ]}
        />
      </Block>

      {/* -------------------------- Toast -------------------------- */}
      <Block title="Toast" align="center">
        <Button
          variant="secondary"
          onClick={() =>
            toast.success("Lưu thành công", "Rủi ro RISK-2026-001 đã được lưu.")
          }
        >
          Success
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.error(
              "Lưu thất bại",
              "Vui lòng kiểm tra lại các trường bắt buộc.",
            )
          }
        >
          Error
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.warning("Cảnh báo", "Rủi ro còn lại ở mức Cao, cần lập KPPN.")
          }
        >
          Warning
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.info("Đang đồng bộ", "Kết nối tới AMIS Mục tiêu...")
          }
        >
          Info
        </Button>
      </Block>

      {/* --------------------- Modal & Confirm --------------------- */}
      <Block title="Modal & hộp thoại xác nhận" align="center">
        <Button variant="secondary" onClick={() => setOpenModal(true)}>
          Modal form (md)
        </Button>
        <Button variant="secondary" onClick={() => setOpenLargeModal(true)}>
          Modal xem chi tiết (lg)
        </Button>
        <Button variant="secondary" onClick={() => setOpenConfirm(true)}>
          Xác nhận (warning)
        </Button>
        <Button variant="danger-outline" onClick={() => setOpenDelete(true)}>
          Xác nhận xoá (danger)
        </Button>
      </Block>

      {/* ------------------------ EmptyState ----------------------- */}
      <section className="misa-card p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-text-primary">
          EmptyState
        </h3>
        <EmptyState
          title="Chưa có rủi ro nào"
          description="Bắt đầu bằng cách thêm mới rủi ro hoặc nhập khẩu từ tệp Excel."
          action={
            <Button variant="primary" icon={<IconPlus size={16} />}>
              Thêm rủi ro
            </Button>
          }
        />
      </section>

      <section className="flex flex-col">
        <h3 className="mb-3 text-[14px] font-semibold text-text-primary">
          Màn hình phân hệ chưa phát triển
        </h3>
        <div className="flex min-h-[220px] flex-col rounded-card bg-page p-1">
          <ComingSoon moduleName="Kiểm toán" />
        </div>
      </section>

      {/* ------------------ Form layout demo ----------------------- */}
      <section className="misa-card p-4">
        <FormSection
          title="Thông tin chung"
          description="Bố cục lưới 2 cột dùng cho màn hình Thêm mới / Sửa"
        >
          <FormGrid cols={2}>
            <Input label="Tên rủi ro" required placeholder="Nhập tên rủi ro" />
            <Select
              label="Chủ sở hữu"
              required
              searchable
              options={OWNERS}
              value={owner}
              onChange={setOwner}
              placeholder="Chọn người phụ trách"
            />
            <Select
              label="Đơn vị"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={setUnit}
              placeholder="Chọn đơn vị"
            />
            <DateInput label="Ngày phát hiện" value={date} onChange={setDate} />
          </FormGrid>
        </FormSection>

        <div className="h-4" />

        <FormSection
          title="Thông tin xem chi tiết"
          description="Bố cục read-only dùng cho màn hình Xem chi tiết"
        >
          <FormGrid cols={3}>
            <ReadField label="Mã rủi ro">RISK-2026-001</ReadField>
            <ReadField label="Mức độ">
              <RiskBadge level="Cao" score={15} />
            </ReadField>
            <ReadField label="Trạng thái">
              <StatusBadge status="Đang theo dõi" />
            </ReadField>
            <ReadField label="Chủ sở hữu">
              <UserCell name="Nguyễn Văn Bình" size={22} />
            </ReadField>
            <ReadField label="Tổn thất ước tính">1.200.000 VNĐ</ReadField>
            <ReadField label="Ghi chú">--</ReadField>
          </FormGrid>
        </FormSection>
      </section>

      {/* ========================= MODALS ========================= */}

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Thêm rủi ro"
        description="Điền đầy đủ các trường bắt buộc"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenModal(false)}>
              Huỷ
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setOpenModal(false);
                toast.success(
                  "Đã lưu",
                  "Rủi ro mới được tạo ở trạng thái Nháp.",
                );
              }}
            >
              Lưu
            </Button>
          </>
        }
      >
        <FormGrid cols={2}>
          <Input label="Tên rủi ro" required placeholder="Nhập tên rủi ro" />
          <Select
            label="Chủ sở hữu"
            required
            searchable
            options={OWNERS}
            value={owner}
            onChange={setOwner}
            placeholder="Chọn người phụ trách"
          />
          <MoneyInput
            label="Tổn thất ước tính"
            value={money}
            onChange={setMoney}
          />
          <DateInput label="Ngày phát hiện" value={date} onChange={setDate} />
        </FormGrid>
        <div className="mt-3.5">
          <Textarea
            label="Mô tả"
            rows={3}
            maxLength={500}
            showCount
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={openLargeModal}
        onClose={() => setOpenLargeModal(false)}
        title="RISK-2026-001 - Gián đoạn hệ thống máy chủ"
        size="lg"
        headerRight={<StatusBadge status="Đang theo dõi" />}
        footer={
          <Button variant="secondary" onClick={() => setOpenLargeModal(false)}>
            Đóng
          </Button>
        }
      >
        <FormGrid cols={3}>
          <ReadField label="Đơn vị">Trung tâm CNTT</ReadField>
          <ReadField label="Chủ sở hữu">
            <UserCell name="Lê Minh Quang" size={22} />
          </ReadField>
          <ReadField label="Ngày phát hiện">16/08/2026</ReadField>
          <ReadField label="Rủi ro cố hữu">
            <RiskBadge level="Trọng yếu" score={25} />
          </ReadField>
          <ReadField label="Rủi ro còn lại">
            <RiskBadge level="Cao" score={15} />
          </ReadField>
          <ReadField label="Tổn thất ước tính">1.200.000 VNĐ</ReadField>
        </FormGrid>
        <div className="mt-4 rounded-ctrl bg-lv-medium-bg p-3 text-[13px] text-lv-medium-text">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <IconAlertTriangle size={16} /> Mức rủi ro còn lại là Cao
          </span>
          <p className="mt-1">
            Theo quy định, rủi ro ở mức Cao hoặc Trọng yếu bắt buộc phải có kế
            hoạch khắc phục và phòng ngừa.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={openConfirm}
        onClose={() => setOpenConfirm(false)}
        onConfirm={() => {
          setOpenConfirm(false);
          toast.success(
            "Đã chuyển trạng thái",
            "Rủi ro chuyển sang Chờ duyệt.",
          );
        }}
        title="Chuyển trạng thái"
        message="Bạn có chắc muốn chuyển rủi ro RISK-2026-001 sang trạng thái Chờ duyệt?"
        confirmText="Chuyển trạng thái"
      />

      <ConfirmDialog
        open={openDelete}
        onClose={() => setOpenDelete(false)}
        onConfirm={handleDelete}
        loading={confirmLoading}
        tone="danger"
        title="Xoá rủi ro"
        message={
          <>
            Bạn có chắc muốn xoá <b>RISK-2026-001</b>? Hành động này không thể
            hoàn tác.
          </>
        }
        confirmText="Xoá"
      />
    </div>
  );
}
