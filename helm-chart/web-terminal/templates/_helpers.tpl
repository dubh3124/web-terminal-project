{{/*
Expand the name of the chart.
*/}}
{{- define "web-terminal.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "web-terminal.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart-specific labels.
*/}}
{{- define "web-terminal.labels" -}}
helm.sh/chart: {{ include "web-terminal.name" . }}-{{ .Chart.Version }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/app-version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Create the selector labels for the application.
These labels are used to select pods created by this chart.
*/}}
{{- define "web-terminal.selectorLabels" -}}
app.kubernetes.io/name: {{ include "web-terminal.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}