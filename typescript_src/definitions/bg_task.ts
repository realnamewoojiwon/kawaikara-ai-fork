export type BackgroundState =
    | 'idle' // 아직 시작되지 않음
    | 'ready' // 시작 가능 상태
    | 'running' // 실행 중
    | 'paused' // 일시 정지됨
    | 'error' // 오류 발생
    | 'finished';

export type BackgroundEvent =
    | 'start' // 실행 시작
    | 'pause' // 실행 중단
    | 'resume' // 다시 실행
    | 'stop' // 실행 종료
    | 'fail' // 오류 발생
    | 'complete';

export type BgTaskMeta = {
    name: string;
    content: string;
};

export interface KawaiBackgrounRunnable {
    meta: () => Promise<BgTaskMeta>;
    getState: () => Promise<BackgroundState>;
    pause: () => Promise<boolean>;
    run: () => Promise<boolean>;
    finalize: () => Promise<boolean>;

    progressCallback: (callback: any) => Promise<boolean>;
    attachStdoutCallback: (callback: any) => Promise<boolean>;
    attachStderrCallback: (callback: any) => Promise<boolean>;
    attachCloseCallback: (callback: any) => Promise<boolean>;
}

export type KawaiPrgoress = {
    id: string;
    filename: string;
    value: {
        progress: number; // progress percentage (%)
        total_size: number; // total size (MiB)
        speed: number; // speed (MiB/s)
        eta_minutes: number; // min
        eta_seconds: number; //sec
    };
    state: BackgroundState;
};

type KawaiYoutubeBgTaskArgs = {
    format?: string; // -f option
    merge_output_format?: string; // --merge-output-format option
    save_directory?: string; // -P option
    cookie_path?: string; // --cookies option
};
// Download subprocesses are deliberately absent from AI fork.
