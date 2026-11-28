# DefaultApi

All URIs are relative to *http://127.0.0.1:3000*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getHealth**](DefaultApi.md#gethealth) | **GET** /health | Report that the synthetic API is up |
| [**getWidget**](DefaultApi.md#getwidget) | **GET** /widgets/{widgetId} | Read one synthetic widget |



## getHealth

> Health getHealth()

Report that the synthetic API is up

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetHealthRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getHealth();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Health**](Health.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The service is healthy |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWidget

> Widget getWidget(widgetId)

Read one synthetic widget

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetWidgetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    widgetId: widgetId_example,
  } satisfies GetWidgetRequest;

  try {
    const data = await api.getWidget(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **widgetId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**Widget**](Widget.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The widget |  -  |
| **404** | No such widget |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

